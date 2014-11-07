define(['jquery', 'backbone'], function($, Backbone){
    var View = Backbone.View.extend({
        el: '#mmx-msgs-tab',
        initialize: function(options){
            var me = this;
            me.options = options;
            me.options.eventPubSub.bind('initMMXProjectMessages', function(model){
                me.model = model;
                me.render();
            });
            $.fn.datepicker.defaults = {
                date : new Date(),
                momentConfig : {
                    culture    : 'en',
                    formatCode : 'L'
                },
                dropdownWidth  : 170,
                allowPastDates : true
            };
        },
        events: {
            'change .repeater-header-left select[name="searchby"]': 'changeSearchBy',
            'click .mmx-messagelist-refresh-btn': 'refresh'
        },
        render: function(){
            var me = this;
            me.sorts = {};
            if(me.rendered) return me.refresh();
            me.rendered = true;
            me.$el.find('.view-container').html(_.template($('#MessagingMessagesListTmpl').html(), {
                filters : me.filters
            }));
            me.list = $('#mmx-messages-list');
            me.list.repeater({
                dataSource       : function(options, cb){
                    me.buildList(options, cb)
                },
                list_selectable  : false,
                list_noItemsHTML : '',
                stretchHeight    : false
            });
        },
        filters : {
            messageid : {
                title : 'Message Id',
                type  : 'search'
            },
            datesent : {
                title : 'Date Sent',
                type  : 'daterange'
            },
            dateack : {
                title : 'Date Acknowledged',
                type  : 'daterange'
            },
            targetdevid : {
                title : 'Target Device Id',
                type  : 'search'
            },
            state : {
                title : 'State',
                type  : 'enum',
                props : [
                    {key:'PENDING', val:'PENDING'},
                    {key:'DELIVERY_ATTEMPTED', val:'DELIVERY_ATTEMPTED'},
                    {key:'WAKEUP_REQUIRED', val:'WAKEUP_REQUIRED'},
                    {key:'WAKEUP_SENT', val:'WAKEUP_SENT'},
                    {key:'DELIVERED', val:'DELIVERED'},
                    {key:'TIMEDOUT', val:'TIMEDOUT'},
                    {key:'CANCELLED', val:'CANCELLED'}
                ]
            }
        },
        changeSearchBy: function(e){
            var val = $(e.currentTarget).val();
            if(this.filters[val]){
                var filter = this.filters[val];
                this.$el.find('.searchby-input-container').html(_.template($('#ADV'+filter.type+'Filter').html(), {
                    filter : filter,
                    name   : val
                }));
            }else{
                this.$el.find('.searchby-input-container').html('');
            }
        },
        refresh: function(){
            this.list.repeater('render');
        },
        collect: function(){
            var me = this, ary = [];
            me.$el.find('.advsearch-filter-item').each(function(){
                var val = utils.collect($(this));
                ary.push({
                    name : $(this).attr('did'),
                    val  : (val.enum || val.search) ? (val.enum || val.search) : val
                });
            });
            return ary;
        },
        retrieve: function(options, cb){
            var me = this;
            var filters = this.collect();
            var params = {};
            for(var i=0;i<filters.length;++i){
                params = typeof filters[i].val == 'object' ? filters[i].val : {search : filters[i].val};
                params.searchby = filters[i].name;
            }
            var query = {};
            if(options.pageIndex !== 0) query.offset = options.pageIndex !== 0 ? (options.pageSize * options.pageIndex) : 1;
            if(options.pageSize != 10) query.size = options.pageSize || 10;
            if(params.searchby && (params.fromDt || params.toDt || params.search || options.search)) query.searchby = params.searchby;
            if(params.fromDt) query.value = new Date(params.fromDt.replace(/-/g, '/')).getTime() / 1000;
            if(params.toDt) query.value2 = new Date(params.toDt.replace(/-/g, '/')).getTime() / 1000;
            if(params.search || options.search) query.value = params.search || options.search;
            if(options.sortDirection && options.sortProperty){
                me.sorts = {
                    sortby    : options.sortProperty,
                    sortorder : options.sortDirection,
                    index     : utils.getIndexByAttr(me.columns, 'property', options.sortProperty)
                };
                if(options.sortProperty == 'deliveryAckAt') options.sortProperty = 'dateack';
                if(options.sortProperty == 'queuedAt') options.sortProperty = 'datesent';
                if(options.sortProperty == 'deviceId') options.sortProperty = 'targetdevid';
                if(options.sortProperty == 'messageId') options.sortProperty = 'messageid';
                query.sortby = options.sortProperty;
                query.sortorder = options.sortDirection == 'asc' ? 'ASCENDING' : 'DESCENDING';
            }
            var qs = '';
            for(var key in query){
                qs += '&'+key+'='+query[key];
            }
            qs = qs.replace('&', '?');
            AJAX('apps/'+me.model.attributes.id+'/messages'+qs, 'GET', 'application/x-www-form-urlencoded', null, function(res, status, xhr){
                if(res && res.results){
                    for(var i=0;i<res.results.length;++i){
                        res.results[i].queuedAt = moment(res.results[i].queuedAt).format('lll');
                        res.results[i].deliveryAckAt = moment(res.results[i].deliveryAckAt).format('lll');
                        res.results[i].state = '<img src="images/dashboard/mmx_state_'+res.results[i].state+'.png" data-toggle="tooltip" data-placement="top" title="'+me.deliveryStates[res.results[i].state]+'" />';
                    }
                }
                cb(res);
            }, function(xhr, status, thrownError){
                alert(xhr.responseText);
            });
        },
        deliveryStates: {
            'PENDING'            : 'Pending',
            'DELIVERY_ATTEMPTED' : 'Delivery attempted',
            'WAKEUP_REQUIRED'    : 'Wake up required',
            'WAKEUP_SENT'        : 'Wake up sent',
            'DELIVERED'          : 'Delivered',
            'TIMEDOUT'           : 'Timeout',
            'CANCELLED'          : 'Cancelled'
        },
        buildList: function(options, callback){
            var me = this;
            me.retrieve(options, function(res){
                var data = {
                    count   : res.total,
                    items   : res.results,
                    page    : (res.offset / options.pageSize),
                    columns : me.columns
                };
                data.pages = Math.ceil(data.count / options.pageSize);
                data.start = data.page * options.pageSize;
                data.end = data.start + options.pageSize;
                data.end = (data.end <= data.count) ? data.end : data.count;
                data.start = data.start + 1;
                setTimeout(function(){
                    $('#mmx-messages-list .repeater-list-header tr').addClass('head').detach().prependTo('#mmx-messages-list .repeater-list-items tbody');
                    if(!$.isEmptyObject(me.sorts)){
                        $('#mmx-messages-list .repeater-list-items tbody tr:first td').each(function(i){
                            var td = $(this);
                            var glyph = 'glyphicon';
                            if(me.sorts.index === i){
                                td.addClass('sorted');
                                if(me.sorts.sortorder == 'asc'){
                                    td.find('.'+glyph).removeClass(glyph+'-chevron-down').addClass(glyph+'-chevron-up');
                                }else{
                                    td.find('.'+glyph).removeClass(glyph+'-chevron-up').addClass(glyph+'-chevron-down');
                                }
                            }
                        });
                    }
                    $('#mmx-messages-list').find('img').tooltip();
                }, 20);
                callback(data);
            });
        },
        columns: [
            {
                label    : 'State',
                property : 'state',
                sortable : true
            },
            {
                label    : 'Date Sent',
                property : 'queuedAt',
                sortable : true
            },
            {
                label    : 'Date Acknowledged',
                property : 'deliveryAckAt',
                sortable : true
            },
            {
                label    : 'Sender',
                property : 'from',
                sortable : false
            },
            {
                label    : 'Recipient',
                property : 'to',
                sortable : false
            },
            {
                label    : 'Recipient Device Id',
                property : 'deviceId',
                sortable : true
            },
            {
                label    : 'Message Id',
                property : 'messageId',
                sortable : true
            }
        ]
    });
    return View;
});