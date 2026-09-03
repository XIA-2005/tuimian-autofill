//parse
(function () {
    var meta = {};
    meta.functions = [];
    meta.length = 0;
    meta.entity = function (func, name, order, seq) {
        this.name = name;
        this.func = func;
        this.seq = seq;
        this.order = order;
    };
    meta.add = function (func, name, order) {
        if (typeof order == 'undefined') order = 10000;
        meta.functions.push(new meta.entity(func, name, order, meta.length));
        meta.length++;
    }
    function sortfunc(left, right) {
        var order = left.order - right.order;
        if (order == 0) return left.seq - right.seq;
        return order;
    }
    Dengdu.parse = function () {
        var funcs = meta.functions.sort(sortfunc);
        for (var i = 0; i < funcs.length; i++) {
            funcs[i].func();
        }
        return funcs.length;
    }
    Dengdu.parseMeta = meta;
})();

//update
(function () {
    var meta = {};
    meta.functions = {};
    meta.add = function (func, name) {
        meta.functions[name] = func;
    }
    meta.update = function () {
        for (var key in meta.functions) {
            meta.functions[key]();
        }
    }
    Dengdu.updatePage = meta;
})();

//filters
(function () {
    Dengdu.mini = Dengdu.mini || {};
    Dengdu.mini.filters = Dengdu.mini.filters || {};
    function isVisible(data, vc) {
        if (!vc) return true;
        vc = mini.decode(vc);
        for (var key in vc) {
            if (data[key] != vc[key]) return false;
        }
        return true;
    }
    Dengdu.mini.validateForm = function(form) {
        var formdata = form.getData();
        form.validate();
        if (form.isValid() === false) {
            var errs = form.getErrors(); var err = null;
            for (var i = 0; i < errs.length; i++) {
                var vc = $(errs[i].getEl()).parents(".dd-element").attr("data-dd-visible");
                if (isVisible(formdata, vc)) {
                    err = errs[i];
                    break;
                }
            }
            if (err) {
                err.focus();
                var $el = $(err.getEl());
                var tabsID = $el.parents(".dd-form-tabs").attr("id");
                if (tabsID) {
                    var tabs = mini.get(tabsID);
                    var tabIndex = $el.parents(".mini-tabs-body").attr("id");
                    tabIndex = tabIndex[tabIndex.length - 1] - 1;
                    tabs.activeTab(tabIndex);
                }
                var label = $(err.getEl()).parents("div.dd-element").find("div.dd-element-name").text();
                var errText = err.errorText;
                mini.showTips({
                    content: "<span class='fwb'>" + label + "</span><br/>" + errText, state: "danger",
                    x: "center", y: "center", timeout: 5000
                });
                return errs;
            }
        }
    }
    var filters = {};
    filters.pb = function (e) {
        if (e.field.startsWith("_pb_") || e.field.startsWith("pb_") || e.column._pb) {
            if (e.value == null) return;
            var value = e.value || 0;
            var cls = 'bg-danger';
            if (value >= 100) {
                cls = 'bg-success';
            } else if (value >= 66) {
                cls = 'bg-info';
            } else if (value >= 33) {
                cls = 'bg-warning';
            }
            e.cellHtml = '<div class="progressbar tal {0}">'
                + '<div class="progressbar-percent {0}" style="width:'.format(cls) + (e.value || 0) + '%;"></div>'
                + '<div class="progressbar-label">' + (e.value || 0) + '%</div>'
                + '</div>';
        }
    }
    filters.link = function (e) {
        if (e.column) {
            var link = mini.decode(e.column._link);
            link.href = link.href.format(e.record);
            link.target = link.target || "_tab";
            if (link.title) {
                link.title = link.title.format(e.record);
            }
            var $html = $("<a></a>").html(e.cellHtml);
            for (var att in link) {
                $html.attr(att, link[att]);
            }
            e.cellHtml = $html[0].outerHTML;
        }
    }
    filters.tag = function (e) {
        if (e.column) {
            if (e.cellHtml) {
                var tags = e.cellHtml.split(e.column._tag);
                var htmls = jslinq(tags).select(function (item) {
                    return '<span class="dd-el-tag dd-el-tag--small mr3">{0}</span>'.format(item);
                }).toArray();
                e.cellHtml = htmls.join("");
            }
        }
    }
    filters.icon = function (e) {
        if (e.column) {
            if (e.cellHtml) {
                e.cellHtml = '&nbsp;<i class="fa {0}"></i>&nbsp;&nbsp;{0}'.format(e.value);
            }
        }
    }
    filters.state = function (e) {
        if (e.column) {
            if (e.value != null) {
                var mapper = { "0": "primary", "1": "success", "2": "warning" };
                var clses = { "p": "primary", "s": "success", "w": "warning", "i": "info", "d": "danger" }
                if (e.column._state.toString().indexOf(':') > -1) {
                    mapper = {};
                    jslinq(e.column._state.split(',')).select(function (item) {
                        var kv = item.split(':'); mapper[kv[0]] = clses[kv[1]] || kv[1];
                    }).ToArray();
                }
                var cls = mapper[e.value.toString()];
                e.cellHtml = '<span class="dd-el-tag dd-el-tag--small dd-el-tag--{1}">{0}</span>'.format(e.cellHtml, cls || "danger");
            }
        }
    }
    filters.img = function (e) {
        if (e.value) {
            var obj = $("#" + e.sender.id).parents(".dd-datagrid-panel,.dd-treegridpanel").attrs();
            if (obj.rel && obj.relstore == "InForm") {
                var src = "/core/ucontent/fmfile?rel={0}&attname={1}&attvalue={2}&preview=2&fit=2".format(obj.rel, e.column.name, e.value);
                e.cellHtml = "<img class=\"dd-img-fmfile-preview\" src=\"{0}\" height=\"40px\" style=\"display:block;\"/>".format(src);
            }
        }
    }
    $.extend(Dengdu.mini.filters, filters);
    $(document.body).on("click", "img.dd-img-fmfile-preview", function (e) {
        window.open($(this).attr("src").replace("&preview=2", "&preview=1"));
    });
    $(document.body).on("click", ".dd-form input.dd-kindeditor-filedialog-button-preview", function (e) {
        var attvalue = $(this).parent().find(".dd-kindeditor-filedialog-text").val();
        if (!attvalue) return;
        var form = $(this).parent().attr("rel"); var attname = $(this).parent().attr("name");
        window.open("/core/ucontent/fmfile?rel={0}&attname={1}&attvalue={2}&preview=1".format(form, attname, attvalue));
    });
})();

//i18n
(function () {
    Dengdu.I18N.config("en-US", {
        Tips: "Tips",
        Uploading: "Uploading",
        SelectedRecords: "Selected {0} records",
        vtypeRegex: "Invalid format",
        vtypeJson: "Must be JSON",
        vtypeXss: "Invalid tags",
        vtypePassword: 'Must contain at least 8 to 30 uppercase and lowercase letters, digits, and special names',
        edit: "Edit",
        missingRecord: "Please select a record",
        missingUrl: "Missing URL",
        saveUnchange: "No data to be saved",
        search: "Search",
        "import": "Import",
        select: "Select",
        inputParameter: "Input Parameter",
        submitUnsaved: "Please save the data before submit it",
        setting: "Setting",
        properties: "Properties",
        buttons: "Buttons",
        form: "Form",
        triggers: "Triggers",
        events: "Events",
        query: "Query",
        gridmove: "Gridmove",
        unsupported: "Unsupported",
        open: "Open",
        saved: "Saved",
        "Contains": "Contains",
        "NotContains": "Not Contains",
        "StartsWith": "Starts With",
        "NotStartsWith": "Not StartsWith",
        "EndsWith": "EndsWith",
        "NotEndsWith": "Not EndsWith",
        "IsNull": "Is Null",
        "IsNotNull": "Is Not Null",
        "IsEmpty": "Is Empty",
        "IsNotEmpty": "Is Not Empty",
        "Between": "Between",
        "NotBetween": "Not Between",
        "In": "In",
        "NotIn": "Not In",
        ",": ", ",
        "ImageSizeError": "Image width must be {0}, and height must be {1}",
        "ImageRatioError": "Image ratio of width and height must be {0}:{1}",
        "FileOverSize": "File size must be not over {0}",
        "ImageTypeError": "The selected file is not an image",
        "FileTypeError": "The selected file is not with type: {0}.",
        DatagridRemoveRowConfirm: "Are you sure to delete the selected {0} records?",
        restore: "Restore",
        saveFirst: "Please save the changes first",
        Processing: "Processing",
        ClickClose: "Click to close.",
        view: "View",
        "Share": "Share",
        "Select": "Select",
        "Dataset": "Dataset"
    });
    Dengdu.I18N.config("zh-Hans", {
        Tips: '友情提示',
        Uploading: '上传中，请等待...',
        SelectedRecords: "已选择 {0} 条记录",
        vtypeRegex: "格式不合法",
        vtypeJson: "必须为JSON",
        vtypeXss: "有非法标签",
        vtypePassword: "必须包含大小写字母、数字、特称字符，至少8个字符，最多30个字符",
        edit: "编辑",
        missingRecord: "请选择一条记录",
        missingUrl: "缺少URL",
        saveUnchange: "没有需要保存的数据",
        search: "查询",
        "import": "导入",
        select: "选择",
        inputParameter: "输入参数",
        submitUnsaved: "请保存后提交",
        setting: "设置",
        properties: "属性",
        buttons: "按钮",
        form: "表单",
        triggers: "触发器",
        events: "事件",
        query: "查询",
        gridmove: "网格移动",
        unsupported: "不被支持",
        open: "打开",
        saved: "已保存",
        "Contains": "包含",
        "NotContains": "不包含",
        "StartsWith": "开始以",
        "NotStartsWith": "不开始以",
        "EndsWith": "结束以",
        "NotEndsWith": "不结束以",
        "IsNull": "是Null",
        "IsNotNull": "不是Null",
        "IsEmpty": "是空",
        "IsNotEmpty": "不是空",
        "Between": "介于",
        "NotBetween": "不介于",
        "In": "在列表",
        "NotIn": "不在列表",
        ",": "，",
        "ImageSizeError": "图像的宽必须为{0}，高必须为{1}",
        "ImageRatioError": "图像宽高比必须{0}:{1}",
        "FileOverSize": "文件大小必须小于{0}",
        "ImageTypeError": "文件类型不是图像",
        DatagridRemoveRowConfirm: "您确认要删除选中的{0}条记录吗？",
        "Upload": "上传",
        "Delete": "删除",
        restore: "还原",
        "FileTypeError": "文件类型不匹配：{0}",
        saveFirst: "请先保存您的更改",
        Processing: "处理中",
        ClickClose: "点击关闭",
        view: '视图',
        Share: '分享',
        Select: "选择",
        Preview: "预览",
        "Dataset": '数据集'
    });
    if (mini.locale == 'zh_CN') {
        if (window.moment) window.moment.locale('zh-cn');
        for (var id in mini) {
            var clazz = mini[id];
            if (clazz && clazz.prototype && clazz.prototype.isControl) {
                clazz.prototype.loadingMsg = "加载中...";
            }
        }
        if (mini.Pager) {
            mini.copyTo(mini.Pager.prototype, {
                firstText: "首页",
                prevText: "上一页",
                nextText: "下一页",
                lastText: "尾页",
                pageInfoText: "<span class=\"dn-xs\">每页 {0} 条，</span>共 {1} 条&nbsp;"
            });
        }
    }
    else {
        if (mini.Pager) {
            mini.copyTo(mini.Pager.prototype, {
                firstText: "First",
                prevText: "Prev",
                nextText: "Next",
                lastText: "Last",
                pageInfoText: "<span class=\"dn-xs\">{0} records per page, </span>total {1} records."
            });
        }
    }
})();

//Cookie
(function () {
    var oldSet = mini.Cookie.set;
    var ishttps = 'https:' == document.location.protocol ? true : false;
    mini.Cookie.set = function (name, value, expires, domain) {
        var options = {};
        if (expires) options.expires = expires;
        if (ishttps) { options.secure = true; options.sameSite = 'none'; }
        Cookies.set(name, value, options);
    };
})();

//Encrypt
(function () {
    mini.crypto = {};
    var serverPubkey = mini.Cookie.get("ASP.NET_PublicKey");
    if (window.JSEncrypt && window.CryptoJS && serverPubkey) {
        mini.crypto.rsaEncrypt = function (plain) {
            if (!window.JSEncrypt) return plain;
            var encrypt = new JSEncrypt();
            encrypt.setPublicKey(serverPubkey);
            return encrypt.encrypt(plain);
        }
        mini.crypto.aesKey = function () {
            var key = "ASP.NET_ClientAesKey"; if (store.get(key) && mini.Cookie.get(key)) return store.get(key);
            var aesKey = CryptoJS.SHA256(Math.uuid()).toString(); store.set(key, aesKey);
            mini.Cookie.set(key, mini.crypto.rsaEncrypt(aesKey)); return aesKey;
        };
        mini.crypto.aesKey();
        var aeskey = function () {
            return CryptoJS.enc.Hex.parse(mini.crypto.aesKey())
        };
        var aesiv = function () {
            return CryptoJS.enc.Hex.parse(mini.crypto.aesKey().substring(0, 32))
        };
        mini.crypto.aesDecrypt = function (cipher, enc) {
            var plainArray = CryptoJS.AES.decrypt(cipher, aeskey(), { mode: CryptoJS.mode.CBC, iv: aesiv(), padding: CryptoJS.pad.Pkcs7 });
            return plainArray.toString(enc || CryptoJS.enc.Utf8);
        };
        mini.crypto.aesEncrypt = function (plain) {
            var encrypted = CryptoJS.AES.encrypt(plain, aeskey(), { mode: CryptoJS.mode.CBC, iv: aesiv(), padding: CryptoJS.pad.Pkcs7 });
            return encrypted.toString();
        }
        mini.crypto.rsaAesEncrypt = function (plain) {
            var keyStr = CryptoJS.SHA256(Math.uuid()).toString(); var key = CryptoJS.enc.Hex.parse(keyStr); var iv = CryptoJS.enc.Hex.parse(keyStr.substring(0, 32));
            var plainArray = CryptoJS.enc.Utf8.parse(plain); var encrypted = CryptoJS.AES.encrypt(plainArray, key, { mode: CryptoJS.mode.CBC, iv: iv, padding: CryptoJS.pad.Pkcs7 });
            var encryptedPlain = encrypted.toString(); var encrypt = new JSEncrypt(); encrypt.setPublicKey(serverPubkey);
            var encryptKey = encrypt.encrypt(keyStr); return encryptKey + "," + encryptedPlain;
        };
    }
})();

//globals
(function () {
    mini_debugger = false;
    window.rsaEncrypt = function (plain) {
        if (window.JSEncrypt && window.CryptoJS) {
            return mini.crypto.rsaAesEncrypt(plain);
        }
        return plain;
    }
    window.formDataBase64ToJson = function (result) {
        if (result[0] === "{" || result[0] === "[" || result === "null") return mini.decode(result);
        if (typeof (result) != 'string') return result;
        var arr = result.split(","); var base64 = arr[0]; var cipher = arr[1]; var json = "";
        if (base64 === "zip") {
            json = pako.ungzip(atob(cipher), { to: "string" });
        }
        else if (base64 === "aes") {
            json = mini.crypto.aesDecrypt(cipher);
        }
        else if (base64 === "zipaes") {
            json = mini.crypto.aesDecrypt(cipher, CryptoJS.enc.Base64);
            json = pako.ungzip(atob(json), { to: "string" });
        }
        else {
            json = CryptoJS.enc.Base64.parse(cipher).toString(CryptoJS.enc.Utf8);
        }
        return mini.decode(json);
    }
    window.filterFields = Dengdu.coalesce($.url().param('ff'), '');
    window.filterValues = Dengdu.coalesce($.url().param('fv'), '');
    window.searchFields = Dengdu.coalesce($.url().param('sf'), '');
    window.searchOperators = Dengdu.coalesce($.url().param('so'), '');
    window.orderFields = Dengdu.coalesce($.url().param('of'), '');
    window.orderValues = Dengdu.coalesce($.url().param('ov'), '');
    //window.searchValues = function () {
    //    var sv = Dengdu.coalesce($.url().param('sv'), '');
    //    if (sv) {
    //        var atts = sv.split(',');
    //        for (var i = 0; i < atts.length; i++) {
    //            atts[i] = atts[i] + '%';
    //        }
    //        return atts.join(",");
    //    }
    //    return "";
    //}();
    window.searchValues = Dengdu.coalesce($.url().param('sv'), '');
    window._fv2obj = function (field, value) {
        if (!field || !value) return {};
        var obj = {};
        if (field) {
            var atts = field.split(',');
            var values = value.split(',');
            for (var i = 0; i < atts.length; i++) {
                obj[atts[i]] = values[i];
            }
        }
        return obj;
    };
    window._obj2fv = function (obj) {
        var atts = []; var values = [];
        for (var att in obj) {
            atts.push(att);
            values.push(obj[att]);
        }
        return { field: atts.join(","), value: values.join(",") };
    };
    window.filterObject = window._fv2obj(window.filterFields, window.filterValues);
    window.searchObject = window._fv2obj(window.searchFields, window.searchValues);
    Dengdu.uformPath = "/core/uform/";
    //tab with cookie
    var tabs = $(".mini-tabs"); var tabIndex = 0;
    var storeName = "miniuiTabActiveIndex";
    tabs.each(function () {
        $(this).attr("onactivechanged", "onMiniTabsActiveChanged");
        var tabId = location.pathname + "_tabs_" + tabIndex;
        if (!$(this).attr("id")) {
            $(this).attr("id", tabId);
        }
        var storeObj = store.get(storeName) || {};
        var activeIndex = $(this).attr("activeIndex") || storeObj[$.md5(tabId)] || 0;
        $(this).attr("activeIndex", activeIndex == -1 ? 0 : activeIndex);
        tabIndex++;
    });
    window.onMiniTabsActiveChanged = function (e) {
        var id = e.sender.id;
        var storeObj = store.get(storeName) || {};
        storeObj[$.md5(id)] = e.sender.activeIndex;
        store.set(storeName, storeObj);
        if (Dengdu.codehighlighter) {
            $('.mini-tabs[id="{0}"]'.format(id)).find('.mini-tabs-body:visible textarea.dd-codemirror').each(function () {
                var name = $(this).attr("name");
                var editor = Dengdu.codehighlighter.highlighters[name];
                if (!editor.ddRefreshed && $(this).parents('.dd-element').is(":visible")) {
                    editor.refresh();
                    editor.ddRefreshed = true;
                }
            });
        }
    };
    JSON.encode = mini.encode;
    JSON.decode = mini.decode;
    //var skin = mini.Cookie.get("miniuiSkin") || 'metro-white';
    //if (skin) {
    //    $('#skin' + skin).attr('iconcls', 'fa-check');
    //    seajs.use(__root + '/scripts/miniui/themes/' + skin + '/skin.css' + __v);
    //}
    //var mode = (mini.Cookie.get("miniuiMode") || 'XLarge');
    //if (mode) {
    //    $('#mode' + mode).attr('iconcls', 'fa-check');
    //    if (mode != "Default") {
    //        if (mode != "XLarge") {
    //            seajs.use(__root + '/scripts/miniui/themes/default/' + mode.toLowerCase() + '-mode.css' + __v);
    //        } else {
    //            seajs.use(__root + '/scripts/areas/core/' + mode.toLowerCase() + '-mode.css' + __v);
    //        }
    //    }
    //};
})();

/////////////////////////////////////////////////
// 多级排序 
// 1) grid:     allowSortColumn="false"
// 2) var sorter = new MultiSort(grid);
/////////////////////////////////////////////////

var MultiSort = function (grid, options) {
    var me = this;
    me.grid = grid;
    me.sortFields = [];
    options = $.extend({
        shiftMultiSort: false
    }, options);
    grid.on("headercellclick", function (e) {
        var column = e.column, field = column.field;
        if (column.allowSort) {
            var o = me.getSort(field);
            if (!o) {
                o = { field: field, dir: "asc" };
            } else {
                if (o.dir === "asc") o.dir = "desc";
                else {
                    me.removeSort(o);
                    return;
                }
            }
            if (!options.shiftMultiSort || e.htmlEvent.shiftKey) {
                me.addSort(o);
            } else {
                me.sort([o]);
            }
        }
    });
    grid.on("update", function () {
        me.syncGridSortIcon();
    });
    grid.on("load", function () {
        me.syncGridSortIcon();
    });
}

MultiSort.prototype = {
    sortFieldsParam: "sortFields",
    sort: function (fields) {
        this.sortFields = fields;
        var o = this.grid.getLoadParams();
        o[this.sortFieldsParam] = mini.encode(fields);
        this.grid.load(o);
        this.syncGridSortIcon();
    },
    addSort: function (field, dir) {
        var me = this, grid = me.grid, fields = me.sortFields;
        var e = { cancel: false };
        grid.fire("beforeload", e);
        if (e.cancel) return;
        if (typeof field === "object") {
            dir = field.dir;
            field = field.field;
        }
        var o = me.getSort(field);
        if (o) {
            o.dir = dir;
        } else {
            o = { field: field, dir: dir };
        }
        fields.remove(o); //fields.insert(0, o);
        fields.push(o);
        me.sort(fields);
    },
    removeSort: function (field) {
        var o = this.getSort(field);
        if (o) {
            this.sortFields.remove(o);
            this.sort(this.sortFields);
        }
    },
    getSort: function (field) {
        if (typeof field === "object") return field;
        for (var i = 0, l = this.sortFields.length; i < l; i++) {
            var o = this.sortFields[i];
            if (o.field == field) return o;
        }
    },
    clearSort: function () {
        this.sort([]);
    },
    syncGridSortIcon: function () {
        var me = this,
            grid = me.grid,
            sortFields = me.sortFields,
            columns = grid.getBottomColumns();
        function createHeaderCellId(column, index) {
            var id = grid._id + "$headerCell" + index + "$" + column._id;
            return id;
        }
        function getHeaderCellEl(column) {
            var el = document.getElementById(createHeaderCellId(column, 1));
            if (!el) el = document.getElementById(createHeaderCellId(column, 2));
            return el;
        }
        function getColumnByField(field) {
            for (var i = 0, l = columns.length; i < l; i++) {
                var col = columns[i];
                if (col.field == field) return col;
            }
        }
        function syncSortIcon() {
            me.syncSortIconTimer = null;
            for (var i = 0, l = sortFields.length; i < l; i++) {
                var o = sortFields[i];
                var column = getColumnByField(o.field);
                if (!column) continue;
                var el = getHeaderCellEl(column);
                if (!el) continue;

                var sortCls = o.dir == "asc" ? "mini-grid-asc" : "mini-grid-desc";
                $(el).removeClass("mini-grid-asc mini-grid-desc").addClass(sortCls);

                $(el).find(".mini-grid-sortIcon").remove();

                $(el).find(".mini-grid-headerCell-inner").append('<span class="mini-grid-sortIcon mini-icon"></span>');
            }
        }
        syncSortIcon();
    }
};

//mainframe

(function () {
    $(function () {
        var tree = mini.get("dd-mainframe-tree");
        var tabs = mini.get('#dd-mainframe-tabs');
        if (!tabs) return;
        var tab = Dengdu.NavTab = {};
        tab.refreshTab = function refreshTab() {
            try {
                var frame = tabs.getTabIFrameEl(currentTab);
                frame.contentDocument.location.href = frame.contentDocument.location.href;
            }
            catch (ex) {
                alert($.t("unsupported"));
            }
        };
        tab.onBeforeOpen = function onBeforeOpen(e) {
            window.currentTab = tabs.getTabByEvent(e.htmlEvent);
            if (!currentTab) {
                e.cancel = true;
            }
        };
        tab.closeTab = function closeTab() {
            tabs.removeTab(currentTab);
        };
        tab.closeAllBut = function closeAllBut() {
            tabs.removeAll(currentTab);
        };
        tab.closeAll = function closeAll() {
            tabs.removeAll();
        };
        tab.tabHelp = function tabHelp() {
            Dengdu.createFormSubmit("/core/home/help", { url: currentTab.url }, 'get');
        };
        tab.tabInfo = function tabInfo() {
            mini.alert(" Title: " + currentTab.title + "<br/> Url: " + currentTab.url);
        };
        tab.windowTab = function windowTab() {
            Dengdu.createFormSubmit(currentTab.url, {}, 'get');
        };
        tab.printTab = function printTab() {
            try {
                var frame = tabs.getTabIFrameEl(currentTab);
                frame.contentWindow.print();
            }
            catch (ex) {
                alert($.t("unsupported"));
            }
        };
        tab.showTab = function (node) {
            var id = "tab$" + node.id; var tab = tabs.getTab(id);
            if (!tab) {
                tab = {}; tab.name = id; tab.title = node.text; tab.showCloseButton = true; tab.iconCls = node.iconCls; tab.url = node.url; tabs.addTab(tab);
            }
            tabs.activeTab(tab);
        }
        var mainframe = Dengdu.MainFrame = {};
        mainframe.onNodeSelect = function (e) {
            var node = e.node; var isLeaf = e.isLeaf;
            if (isLeaf) {
                var target = node.target;
                if (target == '_blank' || target == '_self' || target == '_top') {
                    Dengdu.createFormSubmit(node.url, {}, 'get');
                }
                else {
                    tab.showTab(node);
                }
            }
        }
        mainframe.exit = function exit() {
            if (confirm($.t("confirmMessage"))) {
                window.open('', '_self', '');
                window.close();
            }
        };
        mainframe.logout = function logout() {
            if (confirm($.t("confirmMessage"))) {
                Dengdu.ajax("/core/login/DoLogout", {});
            }
        };
        mainframe.password = function password() {
            Dengdu.createFormSubmit("/core/login/changepassword", {}, 'get');
        };
        mainframe.changeSkin = function changeSkin() {
            var skin = this.text;
            mini.Cookie.set('miniuiSkin', skin, 14);
            window.location.reload();
        };
        mainframe.changeMode = function changeSize() {
            var mode = this.text;
            mini.Cookie.set('miniuiMode', mode, 14);
            window.location.reload();
        };
    });
})();

//vtype extension

(function () {
    mini.VTypes["regexErrorText"] = $.t("vtypeRegex");
    mini.VTypes["regex"] = function (v, p) {
        if (v) {
            var re = new RegExp(p.join(","));
            if (re.test(v)) return true; return false;
        }
        return true;
    }
    mini.VTypes["jsonErrorText"] = $.t("vtypeJson");
    mini.VTypes["json"] = function (v) {
        if (v) {
            try {
                mini.decode(v); return true;
            }
            catch (e) {
                return false;
            }
        }
        return true;
    };
    mini.VTypes["xssErrorText"] = $.t("vtypeXss");
    mini.VTypes["xss"] = function (v) {
        if (v) {
            var regexes = [/<script>/, /<script\/>/];
            for (var i = 0; i < regexes.length; i++) {
                if (regexes[i].test(v)) return false;
            }
        }
        return true;
    };
    mini.VTypes["passwordErrorText"] = $.t("vtypePassword");
    mini.VTypes["password"] = function (v) {
        if (v) {
            var regexes = [/^(?=.*[0-9])(?=.*[A-Z])(?=.*[a-z])(?=.*[^a-zA-Z0-9]).{8,30}$/];
            for (var i = 0; i < regexes.length; i++) {
                if (regexes[i].test(v)) return true;
            }
            return false;
        }
        return true;
    };
    JSVType.validate = function (vtype, text) {
        var items = vtype.split(';');
        for (var i = 0; i < items.length; i++) {
            if (items[i]) {
                var item = items[i].split(':');
                var bool = mini.VTypes[item[0]](text, item[1] ? item[1].split(',') : item[1]);
                if (!bool) return false;
            }
        }
        return true;
    };
})();

//init miniui class
(function () {
    if (window.top == window) {
        $("body").addClass("dd-frame-out");
    }
    else {
        $("body").addClass("dd-frame-in");
    }
    var vabTheme = store.get('theme');
    var themeName = 'bnu';
    if (vabTheme) {
        themeName = vabTheme.themeName || 'bnu';
    }
    $("body").addClass('vab-theme-' + themeName);
    var mode = mini.Cookie.get('miniuiMode') || "XLarge";
    if (mode) {
        $("body").addClass('size-' + mode);
    }
    mini.HtmlFile.prototype.getValue = function () {
        return this.value;
    }
    mini.TimeSpinner.prototype.__setValue = mini.TimeSpinner.prototype.setValue;
    mini.TimeSpinner.prototype.setValue = function (v) {
        if (v) {
            var date = Date.parse(v);
            if (date) v = new Date(date);
            if (!(v instanceof Date)) {
                if (!/^\d{1,2}(:\d{2})*$/.test(v)) {
                    v = null;
                }
                else {
                    if (parseInt(v.split(":")[0]) > 23) {
                        v = null;
                    }
                }
            }
            else if (this.format == 'HH:mm') {
                if (v < new Date(1970, 0, 1) || v >= new Date(1970, 0, 2)) {
                    v = null;
                }
            }
        }
        this.__setValue(v);
    }
    mini.TextBoxList.prototype.__setValue = mini.TextBoxList.prototype.setValue;
    mini.TextBoxList.prototype.setValue = function (v) {
        this.__setValue(v);
        if (!this.getUrl() && this.getData().length == 0) {
            this.setText(v);
        }
    }
    $("div[type=uploadcolumn] .mini-htmlfile").each(function () {
        $(this).attr("onvaluechanged", "onDdGridColumnUpload");
    });
    $("div.dd-element[data-dd-visible]").each(function () {
        var $this = $(this); if ($this.attr("data-dd-visible") && $this.attr("data-dd-visible") != "null") $this.hide();
    });
    $("[data-options]").each(function () {
        var obj = $(this); var options = obj.attr('data-options');
        if (options) {
            try {
                var opts = JSON.decode(options);
                for (var opt in opts) {
                    if (opt != "urlformat") {
                        if (this.tagName == 'IFRAME' && opt == 'src') {
                            obj.attr(opt, opts[opt].format(filterObject));
                        }
                        else {
                            obj.attr(opt, opts[opt]);
                        }
                    }
                    else {
                        var urlformat = opts[opt];
                        var url = urlformat.format(filterObject);
                        if (!/{(\w+)}/g.test(url)) {
                            obj.attr("url", url);
                        }
                        obj.attr(opt, opts[opt]);
                    }
                }
            } catch (e) {
                alert(obj.attr('data-options'));
            }
        }
    });

    if (MultiSort) {
        $("div.mini-datagrid").each(function () {
            if ($(this).attr("multisort") === "true" || $(this).attr("multisort") === "True") {
                $(this).attr("allowSortColumn", "false");
            };
        });
    }

    $("div.mini-datagrid").attr("oncolumnschanged", "onDdDataGridColumnsChanged");

    $("div.mini-datagrid div[property=columns],div.mini-treegrid div[property=columns]").find("input").each(function () {
        $(this).attr("property", $(this).attr("property") || "editor");
    });

    $("div.mini-datagrid div[property=columns],div.mini-treegrid div[property=columns]").children("div").attr('dateFormat', 'yyyy-MM-dd HH:mm:ss');

    $("input[property=editor]").each(function () {
        if ($(this).attr('width'))
            $(this).parent("div").attr('width', $(this).attr('width'));
        $(this).attr('width', '100%');
    });

    $("input[property=editor].mini-datepicker").parent("div").attr('dateFormat', 'yyyy-MM-dd');
    $("input[property=editor][showTime=true].mini-datepicker").parent("div").attr('dateFormat', 'yyyy-MM-dd HH:mm:ss');

    $(".dd-completion input").each(function () {
        $(this).attr('dwidth', $(this).attr('width'));
    });

    $("div.dd-form input").each(function () {
        addDft($(this), 'width', '99.5%');
        function addDft(obj, pro, dft) {
            var nw = Dengdu.coalesce(obj.attr("dwidth"), dft);
            obj.attr(pro, nw);
        }
    });

    $("div.dd-survey input").each(function () {
        addDft($(this), 'width', '99.5%');
        function addDft(obj, pro, dft) {
            var nw = Dengdu.coalesce(obj.attr("width"), dft);
            obj.attr(pro, nw);
        }
    });
    $("div.dd-form input.mini-textarea").attr('width', '99.5%');

    $("input[name='ddztm']").each(function () {
        var input = $(this);
        var rel = Dengdu.coalesce(input.closest('div.dd-datagrid-panel').attr('rel'), input.closest('div.dd-form').attr('rel'), input.closest('div.dd-treegrid-panel').attr('rel'));
        var url = '/core/uform/fsmzt/' + rel;
        var data = Dengdu.ajaxGetObj(url)
        input.attr('class', 'mini-combobox').attr('allowInput', false).attr('data', mini.encode(data));
    });

    $("a.mini-button").each(function () {
        $(this).attr("id", Dengdu.coalesce($(this).attr("id"), Math.uuid()));
    });

    $("div.dd-form .mini-checkbox, div.dd-form .mini-textbox, div.dd-form .mini-autocomplete, div.dd-form .mini-checkboxlist, div.dd-form .mini-radiobuttonlist, div.dd-survey .mini-checkbox, div.dd-survey .mini-textbox, div.dd-survey .mini-autocomplete, div.dd-survey .mini-checkboxlist, div.dd-survey .mini-radiobuttonlist").each(function () {
        $(this).attr("onvaluechanged", Dengdu.coalesce($(this).attr("onvaluechanged"), "onDdControlChanged"));
    });

    $("div.dd-form .mini-combobox, div.dd-survey .mini-combobox").each(function () {
        $(this).attr("onvaluechanged", Dengdu.coalesce($(this).attr("onvaluechanged"), "onDdComboboxChanged"));
        $(this).attr("onbeforeshowpopup", Dengdu.coalesce($(this).attr("onbeforeshowpopup"), "onDdComboboxBeforeShowPopup"));
    });

    $("input[property=editor].mini-combobox").each(function () {
        var editor = $(this); var column = editor.parent();
        if (editor.attr('pc')) {
            var url = editor.attr("url");
            if (!url) {
                var urlformat = editor.attr("urlformat").format(filterObject);
                if (/{(\w+)}/g.test(urlformat)) {
                    column.removeAttr('type').removeAttr('data-options').removeAttr('url');
                }
            }
        }
    });

    $("input.dd-datagrid-filteredit").each(function () {
        $(this).attr("property", "filter").attr("onvaluechanged", "onDdDatagridFilterChanged").attr("multiSelect", "true");
    });

    $(".dd-el-tips").children(":first").attr("title", $.t("ClickClose")).click(function () {
        $(this).parent().hide();
        mini.parse();
    });
})();

mini.parse();

(function () {
    function updateFsmgridTabs() {
        $(".dd-fsmgrid-panel[rel]").each(function () {
            var $this = $(this); var rel = $(this).attr("rel");
            var tabid = $this.find(".dd-fsmgrid-tabs").attr("id");
            var tab = mini.get(tabid);
            var obj = {};
            if (window.filterFields) obj.ff = window.filterFields;
            if (window.filterValues) obj.fv = window.filterValues;
            if (window.searchFields) obj.sf = window.searchFields;
            if (window.searchOperators) obj.so = window.searchOperators;
            if (window.searchValues) obj.sv = window.searchValues;
            obj.groupby = "ddztm";
            $.post("/core/uform/load/{0}".format(rel), obj, function (msg) {
                var dct = { all: 0 };
                for (var i = 0; i < msg.data.length; i++) {
                    msg.data = window.formDataBase64ToJson(msg.data);
                    dct[msg.data[i].gb] = msg.data[i].total;
                    dct.all += msg.data[i].total;
                }
                $this.find(".dd-fsmgrid-tabs .mini-tab").each(function () {
                    var index = $(this).attr("index");
                    var ddztm = tab.tabs[index].name;
                    var cnt = dct[ddztm] || 0;
                    if (!$(this).children(".mini-tab-total").length) {
                        $(this).append('<span class="mini-tab-total"></span>')
                    }
                    $(this).children(".mini-tab-total").text(cnt);
                });
            });
        });
    }
    Dengdu.updatePage.add(updateFsmgridTabs, "updateFsmgridTabs");
})();

$(".mini-treeselect").each(function () {
    var id = $(this).attr("id");
    var treeselect = mini.get(id);
    if ((treeselect.parentSelect || treeselect.parentselect) == "false") {
        treeselect.on('beforenodeselect', function (e) {
            if (e.isLeaf == false) e.cancel = true;
        });
    }
});

$(".dd-buttonedit-daterange").each(function () {
    var $this = $(this);
    $this.click(function () {
        var id = $(this).attr("id"); var buttonedit = mini.get(id); var openurl = "/w3/dd/form/control-daterange";
        mini.open({
            showMaxButton: false, height: getModalHeight(500), width: getModalWidth(820), url: openurl, title: $.t("Select"),
            onload: function () {
                var iframe = this.getIFrameEl();
                var data = { value: buttonedit.getValue(), text: buttonedit.getText() };
                iframe.contentWindow.setValue(data);
            },
            ondestroy: function (action) {
                if (!action || action == "close") return;
                var obj = mini.clone(action);
                buttonedit.setValue(obj.value);
                buttonedit.setText(obj.text);
                buttonedit.doValueChanged();
            },
            allowResize: false
        });
    });
});

//Dengdu.Form Dengdu.gridAjax
$(function () {
    Dengdu.onload.add(function () {
        Dengdu.Form = function (id) {
            var self = this;
            id = id[0] == "#" ? id : "#" + id;
            var miniForm = new mini.Form(id);
            self.getData = function (formatter, deep) {
                var rslt = miniForm.getData();
                if (Dengdu.htmleditor) $.extend(rslt, Dengdu.htmleditor.getData());
                if (Dengdu.codehighlighter) $.extend(rslt, Dengdu.codehighlighter.getData());
                if (Dengdu.monacoEditor) $.extend(rslt, Dengdu.monacoEditor.getData());
                if (Dengdu.signature_pad) $.extend(rslt, Dengdu.signature_pad.getData());
                if (Dengdu.FormControl) $.extend(rslt, Dengdu.FormControl.getData());
                return rslt;
            };
            self.setData = function (data, all, deep) {
                miniForm.setData(data, all, deep);
                if (Dengdu.htmleditor) Dengdu.htmleditor.setData(data);
                if (Dengdu.codehighlighter) Dengdu.codehighlighter.setData(data);
                if (Dengdu.monacoEditor) Dengdu.monacoEditor.setData(data);
                if (Dengdu.signature_pad) Dengdu.signature_pad.setData(data);
                if (Dengdu.FormControl) Dengdu.FormControl.setData(data);
                var fields = self.getFields();
                for (var i = 0; i < fields.length; i++) {
                    var editor = fields[i];
                    if (editor.pc) {
                        var parentControls = JSLINQ(editor.pc.split(',')).Select(function (item) { return data[item]; }).ToArray();
                        var parentObject = {};
                        JSLINQ(editor.pc.split(',')).Select(function (item) { parentObject[item] = data[item]; }).ToArray();
                        var url = editor.urlformat.format(parentControls);
                        url = url.format(parentObject);
                        editor.setUrl(url);
                    };
                }
                self.setVisibility();
            };
            self.setVisibility = function () {
                var data = self.getData();
                var elements = $(id).find(".dd-element").each(function (index, element) {
                    var dd_element = $(element);
                    var data_dd_visible_e = dd_element.attr("data-dd-visible-e");
                    var data_dd_visible = dd_element.attr("data-dd-visible");
                    if (!data_dd_visible && !data_dd_visible_e || data_dd_visible == "null") return;
                    dd_element.hide();
                    var show = 1;                    
                    if (data_dd_visible) {
                        var vc = JSON.decode(data_dd_visible);
                        for (var attname in vc) {
                            var attvalue = vc[attname];
                            if (attvalue && !(new RegExp(attvalue).test(data[attname]) || data[attname] && attvalue.indexOf(data[attname]) >= 0)) { show = 0; break; }
                        }
                    }
                    if (data_dd_visible_e) {
                        if (!Dengdu.evalJsExp(data_dd_visible_e, data)) {
                            if (show) show = 0;
                        }
                    }
                    if (show) dd_element.show();
                });
                if (Dengdu.codehighlighter) {
                    $('.dd-element textarea.dd-codemirror').each(function () {
                        var name = $(this).attr("name");
                        var editor = Dengdu.codehighlighter.highlighters[name];
                        if (!editor.ddRefreshed && $(this).parents('.dd-element').is(":visible")) {
                            editor.refresh();
                            editor.ddRefreshed = true;
                        }
                    });
                }
            }
            self.reset = function () {
                return miniForm.reset();
            };
            self.validate = function () {
                return miniForm.validate();
            };
            self.isValid = function () {
                return miniForm.isValid();
            };
            self.setIsValid = function (bool) {
                return miniForm.setIsValid(bool);
            };
            self.getErrorTexts = function () {
                return miniForm.getErrorTexts();
            };
            self.getErrors = function () {
                return miniForm.getErrors();
            };
            self.loading = function () {
                return miniForm.loading();
            }
            self.unmask = function () {
                return miniForm.unmask();
            };
            self.setChanged = function (bool) {
                return miniForm.setChanged(bool);
            };
            self.isChanged = function () {
                return miniForm.isChanged();
            }
            self.setEnabled = function (bool) {
                return miniForm.setEnabled(bool);
            };
            self.getFields = function () {
                return miniForm.getFields();
            };
            self.reload = function () {
                window.location = window.location;
            }
        };
    }, 1000);

    Dengdu.ajaxSuccess = function (text, success) {
        var msg = JSON.decode(text);
        var timeout = 0;
        if (msg.message) {
            mini.showTips({
                content: msg.message, state: msg.success ? "success" : "danger",
                x: "center", y: "center", timeout: 3000
            });
            timeout = 2000;
        }
        if (msg.script) eval(msg.script);
        if (success) success(msg);
        function done(msg) {
            if (msg.reload) window.location.reload();
            if (msg.href) {
                if (msg.target.startsWith('_modal')) {
                    var arr = msg.target.split(":");
                    var wh = arr[1] ? arr[1].split(",") : [];
                    mini.open({
                        showMaxButton: false, height: getModalHeight(wh[1]), width: getModalWidth(wh[0]), url: msg.href, title: $.t("Tips"),
                        onload: function () { },
                        ondestroy: function (action) { },
                        allowResize: false
                    });
                }
                else {
                    window.open(msg.href, msg.target);
                }
            }
        }
        if (timeout) {
            setTimeout(function () {
                done(msg);
            }, timeout);
        } else {
            done(msg);
        }
        return msg.success;
    };

    Dengdu.gridAjax = function (grid, url, data, async, button, fnSuccess) {
        if (button) {
            if (!button.enabled) return;
            button.disable();
        }
        if (typeof (async) == "undefined" || async == null) async = true;
        grid.loading($.t("Processing") + "...");
        $.ajax({
            async: async, url: url, data: data, type: "post",
            success: function (text) {
                var msg = mini.decode(text);
                if (msg.script) eval(msg.script);
                if (msg.message) {
                    if (fnSuccess && msg.success) {

                    }
                    else {
                        mini.showTips({
                            content: msg.message, state: msg.success ? "success" : "danger",
                            x: "center", y: "center", timeout: 3000
                        });
                        if (grid.ddBeginEditTable) grid.ddBeginEditTable();
                    }
                }
                if (msg.reload && msg.success) grid.reload();
                if (msg.href) {
                    if (msg.target.startsWith('_modal')) {
                        var arr = msg.target.split(":");
                        var wh = arr[1] ? arr[1].split(",") : [];
                        mini.open({
                            showMaxButton: false, height: getModalHeight(wh[1]), width: getModalWidth(wh[0]), url: msg.href, title: $.t("Tips"),
                            onload: function () {},
                            ondestroy: function (action) {},
                            allowResize: false
                        });
                    } else {
                        Dengdu.createFormSubmit(msg.href, {}, 'get', msg.target);
                    }
                }
                if (fnSuccess) {
                    fnSuccess(msg);
                }
                grid.unmask();
                if (button) button.enable();
                if (msg.success && window.CloseOwnerWindow) {
                    var params = $.url().param();
                    if (params.closeonsave) return window.CloseOwnerWindow(msg);
                    if (params.nextonsave) return window.CloseOwnerWindow('next');
                }
            },
            error: function (jqXHR, textStatus, errorThrown) {
                Dengdu.nwalert(jqXHR.responseText);
                grid.unmask();
                if (button) button.enable();
            }
        });
    };
});

$(function () {
    // event handlers
    (function () {
        if (window.top == window) {
            $(".dd-gridbutton-basic-popup").hide();
        }
        $(".dd-gridbutton-basic-popup").click(function (e) {
            e.preventDefault();
            window.open(window.location.href, "_blank");
        });
        $(".dd-gridbutton-basic-feedback").click(function (e) {
            var newhref = "/core/uform/fsmgrid/dd_requirement";
            var node = { id: $.md5(newhref), text: $(this).text(), iconCls: 'fa-envelope-o', url: newhref };
            if (window.top.Dengdu && window.top.Dengdu.NavTab) {
                window.top.Dengdu.NavTab.showTab(node);
            }
            else {
                Dengdu.createFormSubmit(newhref, {}, 'get');
            }
        });
        window.getTopMiniWindows = function () {
            var tmp = window;
            try {
                for (var i = 0; i < 10; i++) {
                    if (tmp.mini && tmp.parent.mini) {
                        tmp = tmp.parent;
                    } else {
                        break;
                    }
                }
            }
            catch (ex) { }
            return tmp;
        }
        window.getModalWidth = function (width) {
            var win = getTopMiniWindows(); var w = win.innerWidth || win.document.documentElement.clientWidth || win.document.body.clientWidth;
            var defaultWidth = parseInt(w * 1);
            if (defaultWidth > 768) defaultWidth = parseInt(defaultWidth * 0.95);
            if (!width) return defaultWidth;
            return Math.min(parseInt(width), defaultWidth);
        };
        window.getModalHeight = function (height) {
            var win = getTopMiniWindows(); var h = win.innerHeight || win.document.documentElement.clientHeight || win.document.body.clientHeight;
            var defaultHeight = parseInt(h * 1) - 10;
            if (!height) return defaultHeight;
            return Math.min(parseInt(height), defaultHeight);
        };
        window.onDatagridPagerItemClick = function (e) {
            var command = e.sender.command;
            if (command == 'toggleRowHeight') {
                e.sender.ddClicks = (e.sender.ddClicks || 0);
                var clses = 'rh-xl rh-l rh-m rh-s rh-xs';
                $('.dd-datagrid-panel').removeClass(clses).addClass(clses.split(' ')[e.sender.ddClicks % 5]);
                e.sender.ddClicks++;
                $.each(mini.ddGrids, function (idx, grid) {
                    grid.doUpdate();
                });
            }
        }
        window.onDatagridShare = function (e) {
            var self = this; var gridid = self.gridid; var command = self.command; var button = e.sender;
            var rel = $(".dd-datagrid-panel,.dd-fsmgrid-panel,.dd-treegrid-panel").attr("rel");
            var openurl = '/www/dd/form/setting-share/' + rel;
            mini.open({
                showMaxButton: false, height: getModalHeight(500), width: getModalWidth(1280), url: openurl, title: $.t("Share"),
                onload: function () {
                },
                ondestroy: function (action) {
                },
                allowResize: false
            });
        }
        window.onDatagridSetting = function (e) {
            var self = this; var gridid = self.gridid; var command = self.command; var button = e.sender;
            var rel = $(".dd-datagrid-panel,.dd-fsmgrid-panel,.dd-treegrid-panel").attr("rel");
            DatagridSetting({ id: gridid, title: $(".dd-datagrid-title").text().trim() }, rel);
        }
        window.DatagridSetting = function (grid, rel) {
            var gridid = grid.id;
            var obj = {};
            var url = $.url().attr('path').toLowerCase();
            if (url.indexOf('/uform/datagrid/') > 0 || url.indexOf('/uform/treegrid/') > 0 || url.indexOf('/uform/index/') > 0 || url.indexOf('/uform/fsmgrid/') > 0) {
                obj.data = JSON.encode([
                    { url: "/core/uform/datagrid/dd_element?ff=formid&fv={0}".format(gridid), title: $.t("properties"), iconCls: 'fa-columns' },
                    { url: "/core/uform/datagrid/dd_formbutton?ff=formid&fv={0}".format(gridid), title: $.t("buttons"), iconCls: 'fa-hand-pointer-o' },
                    { url: "/core/uform/modify/dd_form?ff=id&fv={0}".format(gridid), title: $.t("form"), iconCls: 'fa-table' },
                    { url: "/core/uform/formtrigger/{0}".format(rel), title: $.t("triggers"), iconCls: 'fa-bolt' },
                    { url: "/core/uform/datagrid/dd_formevent?ff=formid&fv={0}".format(gridid), title: $.t("events"), iconCls: 'fa-fire' },
                    { url: "/core/uform/datagrid/dd_form_view?ff=formid&fv={0}".format(gridid), title: $.t("view"), iconCls: 'fa-desktop' }
                ]);
            } else if (url.indexOf('/uform/query/') > 0) {
                obj.data = JSON.encode([
                    { url: "/core/uform/datagrid/dd_formbutton?ff=formid&fv={0}".format(gridid), title: $.t("buttons"), iconCls: 'fa-hand-pointer-o' },
                    { url: "/core/uform/modify/dd_libquery?ff=id&fv={0}".format(gridid), title: $.t("query"), iconCls: 'fa-table' },
                    { url: "/core/uform/datagrid/dd_formtrigger?ff=relschm,relname&fv=$dd_libquery,{0}".format(rel), title: $.t("triggers"), iconCls: 'fa-bolt' },
                    { url: "/core/uform/datagrid/dd_formevent?ff=formid&fv={0}".format(gridid), title: $.t("events"), iconCls: 'fa-fire' }
                ]);
            } else if (url.indexOf('/uform/query2/') > 0) {
                obj.data = JSON.encode([
                    { url: "/core/uform/datagrid/dd_formbutton?ff=formid&fv={0}".format(gridid), title: $.t("buttons"), iconCls: 'fa-hand-pointer-o' },
                    { url: "/core/uform/modify/dd_dw_database_query?ff=id&fv={0}".format(gridid), title: $.t("query"), iconCls: 'fa-table' },
                    { url: "/core/uform/datagrid/dd_formtrigger?ff=relschm,relname&fv=$dd_dw_database_query,{0}".format(rel), title: $.t("triggers"), iconCls: 'fa-bolt' },
                    { url: "/core/uform/datagrid/dd_formevent?ff=formid&fv={0}".format(gridid), title: $.t("events"), iconCls: 'fa-fire' }
                ]);
            } else if (url.indexOf('/www/dd/dw/dataset/') >= 0) {
                obj.data = JSON.encode([
                    { url: "/core/uform/datagrid/dd_formbutton?ff=formid&fv={0}".format(gridid), title: $.t("buttons"), iconCls: 'fa-hand-pointer-o' },
                    { url: "/core/uform/modify/dd_dw_dataset?ff=id&fv={0}".format(gridid), title: $.t("Dataset"), iconCls: 'fa-table' },
                    { url: "/core/uform/datagrid/dd_formtrigger?ff=relschm,relname&fv=$dd_dw_dataset,{0}".format(rel), title: $.t("triggers"), iconCls: 'fa-bolt' },
                    { url: "/core/uform/datagrid/dd_formevent?ff=formid&fv={0}".format(gridid), title: $.t("events"), iconCls: 'fa-fire' }
                ]);
            } else if (url.indexOf('/uform/gridmove/') > 0) {
                obj.data = JSON.encode([
                    { url: "/core/uform/modify/dd_relmtm?ff=id&fv={0}".format(rel), title: $.t("gridmove"), iconCls: 'fa-exchange' },
                    { url: "/core/uform/datagrid/dd_formtrigger?ff=relschm,relname&fv=$dd_relmtm,{0}".format(rel), title: $.t("triggers"), iconCls: 'fa-bolt' }
                ]);
            } else {
                alert($.t("unsupported"));
                return;
            }
            obj.title = "{0}-{1}".format($.t("setting"), grid.title);
            Dengdu.createFormSubmit('/core/api/tab', obj);
        }
        window.onDatagridMenuItemClick = function (e) {
            var self = this; var gridid = self.gridid; var command = self.command; var button = e.sender;
            DatagridMenuItemClick(gridid, command, button);
        };
        window.DatagridMenuItemClick = function (gridid, command, button, rowid) {
            var panel = $('#' + gridid).closest(".dd-datagrid-panel");
            if (panel.length == 0) panel = $('#' + gridid).closest(".dd-treegrid-panel");
            var rel = panel.attr('rel'); var pk = panel.attr('pk'); var relkind = panel.attr('relkind'); var relstore = panel.attr('relstore');
            var grid = mini.get(gridid);
            var state = $('#' + gridid + "_state").val();
            var sfc = mini.get(gridid + "_sf");
            var soc = mini.get(gridid + "_so");
            var svc = mini.get(gridid + "_sv");
            var searchFields = sfc.getValue();
            var searchOperators = soc.getValue();
            var searchValues = svc.getValue();
            var allFields = JSON.decode(sfc.data);
            var modalWidth = grid.modalWidth;
            var modalHeight = grid.modalHeight;
            var changes = grid.getChanges();
            var rows = rowid ? [grid.getRowByUID(rowid)] : grid.getSelecteds();
            if (changes.length > 0 && ['edit'].indexOf(command) != -1) {
                var selectedUids = jslinq(rows).Select(function (row) { return row._uid; }).ToArray();
                changes = jslinq(changes).Where(function (row) { return selectedUids.indexOf(row._uid) == -1; }).ToArray();
            }
            if (changes.length > 0 && ['getselecteds', 'getchanges', 'save', 'remove', 'addrow', 'width', 'setting'].indexOf(command) == -1) {
                grid.ddSave(changes, button, function (msg) {
                    if (msg.success) {
                        if (button) button.enable();
                        doclick();
                    }
                });
            }
            else {
                doclick();
            }
            function doclick() {
                switch (command) {
                    case 'view': DatagridView(); break;
                    case 'add': DatagridAdd(); break;
                    case 'addrow': DatagridCreateRow(1); break;
                    case 'edit': DatagridEditM('open'); break;
                    case 'edit2': DatagridEdit('tab'); break;
                    case 'remove': DatagridRemoveRow(button); break;
                    case 'delete': DatagridDeleteRow(button); break;
                    case 'getselecteds': DatagridGetSelecteds(); break;
                    case 'getchanges': DatagridGetChanges(); break;
                    case 'save': DatagridSaveData(null, button); break;
                    case 'search': DatagridSearch(); break;
                    case 'excel': DatagridExcel('xls', false); break;
                    case 'excel2': DatagridExcel('xls', true); break;
                    case 'dbf': DatagridExcel('dbf', true); break;
                    case 'backup': DatagridExcel('zip', true); break;
                    case 'restore': DatagridRestore('restore', true); break;
                    case 'width': DatagridWidth(); break;
                    case 'setting': DatagridSetting(grid, rel); break;
                    case 'import': DatagridImport(); break;
                    case 'subversion': DatagridSubversion(); break;
                    case 'reload': DatagridReload(); break;
                    default: mini.alert('command needed');
                }
                function DatagridDetail(action, row) {
                    if (row) {
                        mini.open({
                            maxWidth: 5000,
                            showMaxButton: true, height: getModalHeight(modalHeight), width: getModalWidth(modalWidth), url: grid.detailurl, title: $.t("edit"),
                            onload: function () {
                                var iframe = this.getIFrameEl();
                                var data = { action: action, row: row };
                                iframe.contentWindow.SetData(data);
                            },
                            ondestroy: function (message) {
                                if (message == "ok") {
                                    grid.reload();
                                }
                                if (message == "next") {
                                    if (action == "add") {
                                        DatagridAdd();
                                    }
                                    else {
                                        grid.ddGetNext(row, function (nextrow) {
                                            if (nextrow) DatagridDetail(action, nextrow);
                                        });
                                    }
                                }
                            },
                            allowResize: false
                        });
                    } else alert($.t("missingRecord"));
                }
                function DatagridView() {
                    var row = grid.getSelected();
                    DatagridDetail('view', row);
                }
                function DatagridEdit(args) {
                    var row = grid.getSelected();
                    if (row) {
                        if (args == 'open') {
                            DatagridDetail('edit', row);
                        } else if (args == 'tab') {
                            var ff = filterFields ? filterFields + ',' + pk : pk;
                            var fv = filterValues ? filterValues + ',' + row[pk] : row[pk];
                            var newhref = '/core/uform/modify/{0}?ff={1}&fv={2}'.format(rel, ff, fv);
                            Dengdu.createFormSubmit(newhref, {}, 'get');
                        }
                    } else alert($.t("missingRecord"));
                }
                function DatagridEditM(args) {
                    if (rows.length == 0) {
                        mini.showTips({
                            content: $.t("missingRecord"), state: "danger", x: "center", y: "center", timeout: 5000
                        });
                        return;
                    }
                    $.map(rows, function (row) {
                        var newhref = '/core/uform/modify/{0}?ff={1}&fv={2}'.format(rel, pk, row[pk]);
                        if (args == 'open') {
                            DatagridDetail('edit', row);
                        } else if (args == 'tab') {
                            Dengdu.createFormSubmit(newhref, {}, 'get', "_blank");
                        }
                    });
                }
                function DatagridAdd() {
                    var message = Dengdu.ajaxGetObj(grid.newrowurl, { filterFields: filterFields, filterValues: filterValues, viewstate: state });
                    if (message.success) {
                        var row = message.data;
                        DatagridDetail('add', row);
                    } else {
                        alert(message.message);
                    }
                }
                function DatagridGetChanges() {
                    var data = grid.getChanges();
                    var json = mini.encode({ total: data.length, data: data });
                    json = window.rsaEncrypt(json);
                    Dengdu.createFormSubmit('/core/uform/prettyjson', { json: json });
                }
                function DatagridGetSelecteds() {
                    var json = mini.encode({ total: rows.length, data: rows });
                    json = window.rsaEncrypt(json);
                    Dengdu.createFormSubmit('/core/uform/prettyjson', { json: json });
                }
                function DatagridSaveData(changes, button, fnSuccess) {
                    if (grid.editMode == 'table') {
                        grid.commitEdit();
                        if (grid.ddBeginEditTable) grid.ddBeginEditTable();
                    }
                    grid.ddSave(changes, button, fnSuccess);
                }
                function DatagridRemoveRow(button) {
                    if (!rows.length) {
                        mini.showTips({
                            content: $.t("missingRecord"), state: "danger", x: "center", y: "center", timeout: 5000
                        });
                        return;
                    }
                    if (grid.type == 'treegrid') {
                        grid.removeNodes(rows);
                    }
                    else {
                        grid.removeRows(rows, true);
                    }
                }
                function DatagridDeleteRow(button) {
                    if (!rows.length) {
                        mini.showTips({
                            content: $.t("missingRecord"), state: "danger", x: "center", y: "center", timeout: 5000
                        });
                        return;
                    }
                    if (!confirm($.t("DatagridRemoveRowConfirm").format(rows.length))) return;
                    rows = mini.clone(rows);
                    $.each(rows, function (index, row) {
                        row["_state"] = "removed";
                    });
                    DatagridSaveData(rows, button);
                }
                function DatagridCreateRow(append) {
                    var message = Dengdu.ajaxGetObj(grid.newrowurl, { filterFields: filterFields, filterValues: filterValues, viewstate: state });
                    if (message.success) {
                        var row = message.data;
                        if (!append) {
                            grid.addRow(row, 0);
                        } else {
                            grid.addRow(row, grid.data.length);
                        }
                        if (grid.editMode == 'table') {
                            grid.beginEditRow(row);
                        }
                    } else {
                        alert(message.message);
                    }
                }
                function DatagridSearch() {
                    var postobj = { searchFields: searchFields, searchOperators: searchOperators, searchValues: searchValues, filterFields: filterFields, filterValues: filterValues, viewstate: state, qs: mini.encode($.url().param()) };
                    var setobj = {};
                    var searchfielddisabled = (function () {
                        var sfd = grid.sfd || grid.searchfielddisabled;
                        if (sfd) return sfd.split(","); return [];
                    })();
                    function filterColumns(columns) {
                        return jslinq(columns).where(function (item) { return item.field && $.inArray(item.field, searchfielddisabled) === -1; }).select(function (item) { return { field: item.field, header: item.header.replace(/\n|\s/g, ''), editor: item.editor, type: item.type, dataType: item.dataType, so: item.so, sos: item.sos } }).toArray();
                    }
                    var result = [];
                    function iterColumns(columns) {
                        $.each(columns, function (index, item) {
                            if (item.field) {
                                result.push(item);
                            }
                            if (item.columns) {
                                iterColumns(item.columns);
                            }
                        });
                    }
                    iterColumns(grid.columns);
                    setobj.columns = filterColumns(result);
                    setobj.searchFields = grid.sf || grid.searchfield;
                    var openurl = grid.searchtemplate || '/core/uform/searchTemplate2';
                    mini.open({
                        showMaxButton: false, height: getModalHeight(600), width: getModalWidth(openurl === '/core/uform/searchTemplate' ? 500 : 800), url: openurl, title: $.t("search"),
                        onload: function () {
                            var iframe = this.getIFrameEl();
                            var data = setobj;
                            iframe.contentWindow.SetData(data);
                        },
                        ondestroy: function (action) {
                            if (action == "ok") {
                                var iframe = this.getIFrameEl(); var opendata = iframe.contentWindow.GetData(); opendata = mini.clone(opendata);
                                var dsobj = window._fv2obj(window.searchFields, window.searchValues);
                                var sobj = window._fv2obj(opendata.sf, opendata.sv);
                                sobj = $.extend(dsobj, sobj);
                                var sfsv = window._obj2fv(sobj);
                                postobj.searchFields = sfsv.field;
                                postobj.searchValues = sfsv.value;
                                sfc.setValue(postobj.searchFields);
                                svc.setValue(postobj.searchValues);
                                dsobj = window._fv2obj(window.searchFields, window.searchOperators);
                                sobj = window._fv2obj(opendata.sf, opendata.so);
                                sobj = $.extend(dsobj, sobj);
                                sfsv = window._obj2fv(sobj);
                                postobj.searchOperators = sfsv.value;
                                soc.setValue(postobj.searchOperators);
                                grid.load(postobj);
                            }
                        },
                        allowResize: false
                    });
                }
                function DatagridExcel(ext, all) {
                    var columns = grid.getBottomColumns();
                    function getColumns(columns) {
                        columns = columns.clone();
                        for (var i = columns.length - 1; i >= 0; i--) {
                            var column = columns[i];
                            if (!column.field || (!all && !column.visible)) {
                                columns.removeAt(i);
                            } else {
                                var c = { header: column.header, field: column.field };
                                columns[i] = c;
                            }
                        }
                        return columns;
                    }
                    columns = getColumns(columns);
                    var jsonColumns = mini.encode(columns);
                    var postobj = { rel: rel, relkind: relkind, relstore: relstore, pk: pk, ext: ext, searchFields: window.searchFields, searchOperators: window.searchOperators, searchValues: window.searchValues, filterFields: filterFields, filterValues: filterValues, viewstate: state, columns: jsonColumns, qs: mini.encode($.url().param()) };
                    var lp = grid.getLoadParams();
                    postobj.searchFields = lp.sf || lp.searchFields || lp.searchfields;
                    postobj.searchValues = lp.sv || lp.searchValues || lp.searchvalues;
                    postobj.searchOperators = lp.so || lp.searchOperators || lp.searchoperators;
                    postobj.allcolumn = all ? 1 : 0;
                    Dengdu.createFormSubmit(grid.exporturl || '/core/uform/export', postobj);
                }
                function DatagridImport() {
                    var openurl = '/core/uform/ImportTemplate?' + $.param({ rel: rel, relstore: relstore, ff: filterFields, fv: filterValues });
                    mini.open({
                        showMaxButton: false, height: getModalHeight(400), width: getModalWidth(400), url: openurl, title: $.t("import"),
                        onload: function () {
                        },
                        ondestroy: function (action) {
                            grid.reload();
                        },
                        allowResize: false
                    });
                }
                function DatagridRestore() {
                    var openurl = '/www/dd/pip/form-importer';
                    mini.open({
                        showMaxButton: false, height: getModalHeight(400), width: getModalWidth(400), url: openurl, title: $.t("restore"),
                        onload: function () {
                        },
                        ondestroy: function (action) {
                            grid.reload();
                        },
                        allowResize: false
                    });
                }
                function DatagridWidth() {
                    var columns = grid.getBottomColumns();
                    function getColumns(columns) {
                        columns = columns.clone();
                        for (var i = columns.length - 1; i >= 0; i--) {
                            var column = columns[i];
                            if (!column.field || !column.visible) {
                                columns.removeAt(i);
                            } else {
                                var c = { header: column.header, field: column.field, width: column.width };
                                columns[i] = c;
                            }
                        }
                        return columns;
                    }
                    columns = getColumns(columns);
                    var jsonColumns = mini.encode(columns);
                    var obj = { rel: rel, relstore: relstore, columns: jsonColumns };
                    Dengdu.gridAjax(grid, '/core/uform/width', obj);
                }
                function DatagridSubversion() {
                    var row = grid.getSelected();
                    if (row) {
                        var url = '/core/uform/datagrid/dd_subversion?ff=formname,pkattname,pkattvalue&fv={0},{1},{2}'.format(rel, pk, row[pk]);
                        Dengdu.createFormSubmit(url);
                    } else alert($.t("missingRecord"));
                }
                function DatagridReload() {
                    grid.reload();
                }
            }
        }

        window.onDdButtonEdit = function (e) {
            var gridid = $('.dd-datagrid-panel .mini-datagrid,.dd-treegrid-panel .mini-treegrid').attr('id'); var grid = null; var form = null;
            if (gridid) {
                grid = mini.get(this.gridid || gridid);
            }
            else {
                var formid = $(this.getEl()).parents('.dd-form').attr('id');
                form = new Dengdu.Form(this.gridid || formid);
            }
            var btnEdit = this;
            var popupWidth = Dengdu.coalesce(btnEdit['popupwidth'], 0); var popupHeight = Dengdu.coalesce(btnEdit['popupheight'], 0);
            var textField = Dengdu.coalesce(btnEdit['textfield'], 'text'); var valueField = Dengdu.coalesce(btnEdit['valuefield'], 'id');
            var name = btnEdit["name"]; var textName = Dengdu.coalesce(btnEdit["textname"], btnEdit["textName"]);
            var attmap = btnEdit["attmap"];
            var record = grid ? grid.getSelected() : form.getData();
            var btnUrl = btnEdit['url'].format(record);
            mini.open({
                url: btnUrl,
                title: $.t("select"),
                width: parseInt(getModalWidth(popupWidth)),
                height: parseInt(getModalHeight(popupHeight)),
                ondestroy: function (action) {
                    if (action == "ok") {
                        var iframe = this.getIFrameEl(); var data = iframe.contentWindow.GetData(); data = mini.clone(data);
                        if (data) {
                            if (grid) {
                                grid.cancelEdit(); var row = grid.getSelected();
                                var row2 = {}; row2[name] = data[valueField]; row2[textName] = data[textField];
                                if (attmap) {
                                    var maps = attmap.split(',');
                                    for (i = 0; i < maps.length; i++) {
                                        var map = maps[i].split('-');
                                        row2[map[map.length - 1]] = data[map[0]];
                                    }
                                }
                                grid.updateRow(row, row2);
                            }
                            else {
                                if (form) {
                                    var row2 = form.getData();
                                    if (attmap) {
                                        var maps = attmap.split(',');
                                        for (i = 0; i < maps.length; i++) {
                                            var map = maps[i].split('-');
                                            row2[map[map.length - 1]] = data[map[0]];
                                        }
                                    }
                                    form.setData(row2);
                                }
                                btnEdit.setValue(data[valueField]); btnEdit.setText(data[textField]);
                            }
                        }
                    }
                },
                allowResize: false
            });
        }

        window.ddSearchOperators = [
            { value: "0", text: "=", cnt: 1 },
            { value: "1", text: "!=", cnt: 1 },
            { value: "2", text: "<", cnt: 1 },
            { value: "3", text: "<=", cnt: 1 },
            { value: "4", text: ">", cnt: 1 },
            { value: "5", text: ">=", cnt: 1 },
            { value: "6", text: $.t("Contains"), cnt: 1 },
            { value: "7", text: $.t("NotContains"), cnt: 1 },
            { value: "8", text: $.t("StartsWith"), cnt: 1 },
            { value: "9", text: $.t("NotStartsWith"), cnt: 1 },
            { value: "A", text: $.t("EndsWith"), cnt: 1 },
            { value: "B", text: $.t("NotEndsWith"), cnt: 1 },
            { value: "C", text: $.t("IsNull"), cnt: 0 },
            { value: "D", text: $.t("IsNotNull"), cnt: 0 },
            { value: "E", text: $.t("IsEmpty"), cnt: 0 },
            { value: "F", text: $.t("IsNotEmpty"), cnt: 0 },
            { value: "G", text: $.t("Between"), cnt: 2 },
            { value: "H", text: $.t("NotBetween"), cnt: 2 },
            { value: "I", text: $.t("In"), cnt: 1 },
            { value: "J", text: $.t("NotIn"), cnt: 1 }
        ];
        function ddSearchOperatorsFilter(ids) {
            ids = ids.split('');
            var filtered = jslinq(window.ddSearchOperators).where(function (item) { return ids.contains(item.value); }).toArray();
            return filtered;
        }
        window.ddGetSearchOperator = function (column) {
            if (column.sos) return ddSearchOperatorsFilter(column.sos);
            var datatype = column.dataType;
            if (datatype === "string") return window.ddSearchOperators;
            var ids = "";
            if (column.type == "checkboxcolumn") {
                ids = "0";
            }
            else if (datatype == "int" || datatype == "float" || datatype == "date" || datatype == "guid") {
                ids = "012345CDGHIJ";
            }
            else if (datatype == "boolean") {
                ids = "01";
            }
            if (ids) {
                return ddSearchOperatorsFilter(ids)
            }
            return window.ddSearchOperators;
        }

        window.onDdDataGridColumnsChanged = function (e) {
            var grid = e.sender; var columns = grid.getColumns(); var obj = store.get("DdDataGridColumn") || {};
            obj[e.sender.id] = jslinq(columns).select(function (column) { return { name: column.name, width: column.width, visible: column.visible } }).where(function (column) { return column.name }).toArray();
            store.set("DdDataGridColumn", obj);
        }

        window.onDdDatagridFilterChanged = function (e) {
            var gridid = e;
            if (e.sender) {
                gridid = $('#' + e.sender.id).parents(".dd-datagrid-panel").find(".mini-datagrid,.mini-treegrid").attr('id');
            }
            var grid = mini.get(gridid);
            var sfs = []; var sos = []; var svs = [];
            var state = mini.get(gridid + "_state").getValue();
            var postobj = { filterFields: filterFields, filterValues: filterValues, viewstate: state, qs: mini.encode($.url().param()) };
            if (window.searchFields) {
                sfs.push(window.searchFields); sos.push(window.searchOperators); svs.push(window.searchValues);
            }
            if (e.sender.id.indexOf("quicksearch") == -1) {
                $("#" + gridid).find(".dd-datagrid-filteredit").each(function (index, item) {
                    var filterid = item.id; var filter = mini.get(filterid);
                    var sf = item.id.substring(44); var sv = filter.getValue(); var so = filter.getFilterValue ? filter.getFilterValue() : grid.getColumn(sf).so;
                    if (sv) {
                        sfs.push(sf); sos.push(so); svs.push(sv.split(',').join('|'));
                    }
                });
            }
            else {
                var value = e.sender.getValue();
                if (value) {
                    $.each(grid.quicksearchfields.split(','), function (idx, sf) {
                        var sv = value; var so = grid.getColumn(sf).so;
                        if (sv) {
                            sfs.push(sf); sos.push(so); svs.push(sv.split(',').join('|'));
                        }
                    });
                    postobj.and = 0;
                }
            }
            postobj = $.extend(postobj, { sf: sfs.join(','), sv: svs.join(','), so: sos.join(",") })
            grid.load(postobj);
        }

        window.onDdGridColumnUpload = function (e) {
            var grid = mini.get($('.mini-datagrid,.mini-treegrid').attr('id'));
            grid.loading();
            var self = this;
            if (!this.validate()) {
                self.setValue('');
                self.setText('');
                grid.unmask();
                return alert(this.errorText);
            }
            var options = JSON.decode(self.options || "{}");
            var input = $(this.el).find('input[type=file]')[0];
            if (!input.files.length) {
                grid.unmask();
                return;
            }
            var file = input.files[0];
            if (options.maxsize) {
                if (file.size > parseInt(options.maxsize)) {
                    self.setValue('');
                    self.setText('');
                    grid.unmask();
                    return alert($.t('FileOverSize').format(Dengdu.m2h(parseInt(options.maxsize))));
                }
            }
            var limittype = self.limittype || options.filter;
            if (limittype) {
                var filename = file.name;
                var limittypes = limittype.replace(/\*/g, '').split(/[;,]/);
                var match = false;
                $.each(limittypes, function (index, item) {
                    if (item && filename.indexOf('.') > 0 && filename.toLowerCase().endsWith(item)) {
                        match = true;
                    }
                });
                if (!match) {
                    self.setValue('');
                    self.setText('');
                    grid.unmask();
                    return alert($.t("FileTypeError").format(limittype));
                }
            }
            var formData = new FormData();
            formData.append("imgFile", file);
            formData.append("name", this.name);
            formData.append("rel", $("div[rel]").attr("rel"));
            Dengdu.fileAjax('/core/uform/uj', formData, function (text) {
                var msg = JSON.decode(text);
                if (msg.error) {
                    self.setValue('');
                    self.setText('');
                }
                if (msg.message) {
                    alert(msg.message);
                }
                if (msg.url) {
                    if (grid.editMode != 'table') {
                        grid.cancelEdit();
                    }
                    var rows = grid.getSelecteds();
                    if (rows.length == 0) return mini.alert($.t("missingRecord"));
                    var row;
                    if (rows.length == 1) {
                        row = rows[0];
                    }
                    else {
                        for (var i = 0; i < rows.length; i++) {
                            if (e.sender.ownerRowID == rows[i]._id) {
                                row = rows[i];
                            }
                        }
                    }
                    var obj = {};
                    obj[self.name] = msg.url;
                    if (self.displayfield) {
                        obj[self.displayfield] = msg.data;
                    }
                    if (grid.editMode == 'table') {
                        grid.commitEditRow(row);
                    }
                    grid.updateRow(row, obj);
                    if (grid.editMode == 'table') {
                        grid.beginEditRow(row);
                    }
                }
                grid.unmask();
            });
        }

        window.onDdComboboxChanged = function (e) {
            var editor = e.sender;
            if (editor.cc) {
                var childControls = JSLINQ(editor.cc.split(',')).Select(function (item) { return mini.get(item); }).ToArray();
                for (var i = 0; i < childControls.length; i++) {
                    childControls[i].setValue(null);
                }
            }
            var formid = $(document.getElementById(editor.id)).closest(".dd-form,.dd-survey").attr("id");
            var form = new Dengdu.Form("#" + formid);
            form.setVisibility();
        };

        window.onDdControlChanged = function (e) {
            var editor = e.sender;
            var formid = $(document.getElementById(editor.id)).closest(".dd-form,.dd-survey").attr("id");
            if (!formid) {
                formid = $(editor.el).closest(".dd-form,.dd-survey").attr("id");
            }
            var form = new Dengdu.Form("#" + formid);
            form.setVisibility();
        }

        window.onDdComboboxBeforeShowPopup = function (e) {
            var editor = e.sender;
            if (editor.pc) {
                var div = $('#' + editor.id).closest(".dd-form"); var formid = div.attr("id"); var form = new Dengdu.Form("#" + formid);
                var record = form.getData(); var message = formDataBase64ToJson(div.attr("srcdata")); record = $.extend({}, message.data || message, record);
                var parentControls = JSLINQ(editor.pc.split(',')).Select(function (item) { return record[item]; }).ToArray();
                var parentObject = {};
                JSLINQ(editor.pc.split(',')).Select(function (item) { parentObject[item] = record[item]; }).ToArray();
                var url = editor.urlformat.format(parentControls);
                url = url.format(parentObject);
                editor.setUrl(url);
            };
        };

        window.OnDdCellCommitEdit = function (e) {
            var grid = e.sender; var record = e.record; var field = e.field; var value = e.value; var editor = e.editor;
            if (e.editor && e.editor.cc) {
                var obj = {};
                var cc = editor.cc.split(',');
                for (var i = 0; i < cc.length; i++) {
                    obj[cc[i]] = null;
                }
                grid.updateRow(record, obj);
            }
            if (e.editor && e.editor.type == 'htmlfile') {
                e.cancel = true;
            }
        }

        window.OnDdCellBeginEdit = function (e) {
            var grid = e.sender; var record = e.record; var field = e.field; var value = e.value; var editor = e.editor;
            if (e.editor && editor.pc) {
                var parentControls = JSLINQ(editor.pc.split(',')).Select(function (item) { return record[item]; }).ToArray();
                var parentObject = {};
                JSLINQ(editor.pc.split(',')).Select(function (item) { parentObject[item] = record[item]; }).ToArray();
                var url = editor.urlformat.format(parentControls);
                url = url.format(parentObject);
                editor.setUrl(url);
            }
        }

    })();

    // mini-form
    $(function () {
        Dengdu.onload.add(function () {
            var timeout = 0;
            if ($('.dd-kindeditor').length > 0 || $('.dd-codemirror').length > 0 || $('.dd-monacoeditor').length > 0 || $('.dd-simplemde').length > 0 || $('.dd-fc-iframe').length > 0) {
                timeout = 300;
            }
            setTimeout(function () {
                $(".dd-form.detail,.dd-form.modify").each(function () {
                    var div = $(this); var formid = div.attr("id"); var rel = div.attr("rel"); var storeKey = "dd.form.create.{0}".format(rel);
                    var form = new Dengdu.Form("#" + formid);
                    var message = formDataBase64ToJson(div.attr("srcdata"));
                    if (!message.success) window.location.href = "/core/error?tips={0}".format(message.message);
                    var row = message.data;
                    if (row._state == 'added') {
                        var obj = store.get(storeKey);
                        if (obj) {
                            obj = mini.decode(obj);
                            row = obj;
                        }
                        var param = $.url().param();
                        for (var att in param) {
                            row[att] = param[att];
                        }
                    }
                    div.find(".dd-completion,.dd-tablecontrol").each(function () {
                        var name = $(this).attr('name');
                        row[name] = JSON.decode(row[name]);
                    });
                    form.setData(row, true, true);
                    div.find(".mini-autocomplete").each(function () {
                        var self = $(this); var id = self.attr("id");
                        var auto = mini.get(id); var url = auto.url;
                        if (url) {
                            url = url.replace('/codequery', '/codetext');
                            var v = auto.getValue();
                            if (v) {
                                var obj = Dengdu.ajaxGetObj(url, { data: JSON.encode([v]) });
                                if (obj && obj.length == 1) {
                                    auto.setText(obj[0].text);
                                }
                                else {
                                    auto.setText(v);
                                }
                            }
                        }
                    });
                    div.find(".mini-textboxlist").each(function () {
                        var self = $(this); var id = self.attr('id');
                        var auto = mini.get(id); var url = auto.url;
                        if (url) {
                            url = url.replace('/codequery', '/codetext');
                            var v = auto.getValue();
                            if (v) {
                                var obj = Dengdu.ajaxGetObj(url, { data: JSON.encode(v.split(',')) });
                                if (obj) {
                                    auto.setValue($.map(obj, function (item) { return item.id }).join(','));
                                    auto.setText($.map(obj, function (item) { return item.text }).join(','));
                                }
                            }
                        }
                    });
                    div.find(".dd-form-toolbar").show();
                    if (row.ddztm) {
                        $("div.dd-form.modify div.dd-form-fsm div.mini-datagrid").each(function () {
                            var gridid = this.id;
                            var grid = mini.get(gridid);
                            grid.on("loaderror", onDatagridLoadError);
                            grid.load({ ff: filterFields, fv: filterValues });
                            function onDatagridLoadError(sender) {
                                Dengdu.nwalert(sender.xhr.responseText);
                            }
                        });
                    }
                });
                mini.parse();
            }, timeout);
        }, 1001);
        //mini-datagrid mini-treegrid
        Dengdu.onload.add(function () {
            $(".dd-dropdown-menu>a").click(function () {
                var $a = $(this); var $item = $a.next(); var offset = $a.offset(); var wheight = $(window).height(); $item.css("left", "").css("top", "");
                var iheight = $item.height(); var sheight = $a.height();
                $item.css("position", "fixed").toggle();
                if (offset.top + sheight + iheight < wheight)
                    $item.offset({ left: offset.left, top: offset.top + sheight });
                else
                    $item.offset({ left: offset.left, top: offset.top - iheight });
            });
            $(".dd-dropdown-menu ul li a").click(function () {
                $(this).parents(".dd-dropdown-menu").children("a").click();
            });
            mini.ddGrids = [];
            function ddGridGetNext(grid, row, next) {
                if (!next) next = function (r) {
                    console.log(r);
                };
                if (!row) row = grid.getSelected();
                if (!row) {
                    row = grid.getRowByUID(1);
                    return next(row);
                }
                if (row._uid < grid.data[grid.data.length - 1]._uid) {
                    row = grid.getRowByUID(row._uid + 1);
                    return next(row);
                } else if (grid.data.length < grid.pageSize) {
                    return next(null);
                } else if (grid.pageIndex == grid.totalPage - 1) {
                    return next(null);
                } else {
                    grid.load(grid.getLoadParams(), function () {
                        var row = grid.data[0];
                        return next(row);
                    });
                }                          
            }
            $('div.dd-datagrid.mini-datagrid,div.dd-treegrid.mini-treegrid').each(function () {
                var gridid = this.id; var $panel = $('#' + gridid).parents(".dd-datagrid-panel"); var isCrypto = ($panel.attr("crypto") || "true") == "true";
                var grid = mini.get(gridid);
                grid.editMode = grid.editMode || grid.editmode;
                grid.modalWidth = grid.modalWidth || grid.modalwidth;
                grid.modalHeight = grid.modalHeight || grid.modalheight;
                grid.ddGetNext = function (row, next) { return ddGridGetNext(grid, row, next) };
                mini.ddGrids.push(grid);
                grid.dd_updatable = $panel.attr("updatable"); grid.dd_deletable = $panel.attr("deletable");
                var rowbuttons = (function () {
                    var buttons = [];
                    var actioncolumn = mini.decode(grid.actioncolumn || "{}");
                    grid.dd_rowbutton_icon = (actioncolumn.icon || "true").toString().toLowerCase()[0] == 't';
                    grid.dd_rowbutton_text = (actioncolumn.text || "false").toString().toLowerCase()[0] == 't';
                    var editBtn = (actioncolumn.edit || "true").toString().toLowerCase()[0] == 't' && grid.dd_updatable;
                    var deleteBtn = (actioncolumn['delete'] || "true").toString().toLowerCase()[0] == 't' && grid.dd_deletable;
                    if (editBtn) {
                        buttons.push({ cls: 'dd-rowbutton', buttonid: $panel.find(".dd-gridbutton-basic-modify").attr("id") || '', iconCls: 'fa-edit', text: $.t('edit'), command: 'edit', vexp: actioncolumn.edit || "true" });
                    }
                    if (deleteBtn) {
                        buttons.push({ cls: 'dd-rowbutton', buttonid: $panel.find(".dd-gridbutton-basic-remove").attr("id") || '', iconCls: 'fa-remove', text: $.t('Delete'), command: 'delete', vexp: actioncolumn['delete'] || "true" });
                    }
                    $panel.find(".dd-gridbutton").each(function (index, item) {
                        var mbtn = mini.get(item.id);
                        if (mbtn._row)
                            buttons.push({ cls: 'dd-gridbutton', buttonid: item.id, iconCls: mbtn.iconCls, text: mbtn.text, vexp: mbtn._row });                        
                        if (mbtn.ve) {
                            try {
                                var vis = Dengdu.evalJsExp(mbtn.ve, $.extend({}, window.filterObject, $.url().param()));
                                if (!vis) mbtn.hide();
                            }
                            catch (ex) {
                                console.log(ex);
                            }
                        }
                    });
                    $.map(buttons, function (button) {
                        button.gridid = gridid;
                    });
                    return buttons;
                })();
                function buttonRowVisible(exp, record) {
                    if (exp == null) return true;
                    if (typeof exp != 'string') return exp;
                    if (exp == 'true' || exp == 'True') return true;
                    if (exp == 'false' || exp == 'False') return false;
                    try {
                        return Dengdu.evalJsExp(exp, record);
                    }
                    catch (ex) {
                        return true;
                    }
                }
                grid.ddSave = function (changes, button, fnSuccess) {
                    var data = changes || grid.getChanges();
                    if (data.length && grid.fsmsavenovalidate != "1") {
                        for (var i = 0; i < data.length; i++) {
                            var row = data[i];
                            grid.validateRow(row);
                            if (grid.isValid() == false) {
                                var error = grid.getCellErrors()[0];
                                if (error) {
                                    var error = grid.getCellErrors()[0];
                                    if ((grid.editMode || 'cell') == 'cell') {
                                        grid.beginEditCell(error.record, error.column);
                                    }
                                    var errorText = $.t("vtypeRegex");
                                    try {
                                        errorText = '{0}{1}'.format(error.column.header.replace(/\s/g, ''), error.errorText);
                                    }
                                    catch (e) { }
                                    mini.showTips({
                                        content: errorText, state: "danger", x: "center", y: "center", timeout: 5000
                                    });
                                    return;
                                }
                            }
                        }
                    }
                    var state = mini.get(gridid + "_state").getValue();
                    if (data.length > 0) {
                        var json = mini.encode(data);
                        if (isCrypto) {
                            json = window.rsaEncrypt(json);
                        }
                        Dengdu.gridAjax(grid, grid.saveurl, { data: json, viewstate: state, ff: filterFields, fv: filterValues }, null, button, fnSuccess);
                    } else {
                        if (fnSuccess) {
                            fnSuccess(msg);
                        }
                        else {
                            mini.showTips({
                                content: $.t("saved"), state: "success", x: "center", y: "center", timeout: 3000
                            });
                        }
                    }
                }
                grid.ddBeginEditTable = function () {
                    if (grid.editMode == 'table') {
                        var rows = grid.getData();
                        for (var i in rows) {
                            grid.beginEditRow(rows[i]);
                        }
                    }
                }
                grid.on("preload", onDatagridPreLoad);
                grid.on("loaderror", onDatagridLoadError);
                grid.on("load", onDatagridLoad);
                grid.on("drawcell", function (e) {
                    if (e.columnIndex == 0 && (e.record._rowCls || e.record._rowcls)) {
                        e.rowCls = e.record._rowCls || e.record._rowcls;
                    };
                    if (e.field) {
                        if (e.column) {
                            var filters = [];
                            if (e.field.startsWith("_pb_") || e.field.startsWith("pb_") || e.column._pb) {
                                filters.push("pb");
                            }
                            if (e.column._link) {
                                filters.push("link");
                            }
                            if (e.column._tag) {
                                filters.push("tag");
                            }
                            if (e.column._icon) {
                                filters.push("icon");
                            }
                            if (e.column._state) {
                                filters.push("state");
                            }
                            if (e.column._filter) {
                                filters.push(e.column._filter);
                            }
                            $.each(filters, function (idx, item) {
                                var filterFn = Dengdu.mini.filters[item];
                                if (filterFn) filterFn(e);
                            });
                        }
                    }
                    if (e.column && e.column.type == "actioncolumn") {
                        var htmls = jslinq(rowbuttons).select(function (value, index) {
                            var obj = mini.clone(value);
                            if (!buttonRowVisible(obj.vexp, e.record)) return '';
                            obj.rowid = e.record._uid;
                            obj.innerText = grid.dd_rowbutton_text ? (" " + obj.text) : "";
                            obj.icon = grid.dd_rowbutton_icon ? '<i class="fa {iconCls}"></i>'.format(obj) : "";
                            if (obj.cls == 'dd-gridbutton') {
                                return '<a class="dd-gridbutton" buttonid="{buttonid}" rowid="{rowid}" title="{text}">{icon}{innerText}</a>'.format(obj);
                            }
                            else {
                                return '<a class="dd-rowbutton" buttonid="{buttonid}" rowid="{rowid}" title="{text}" command="{command}" gridid="{gridid}">{icon}{innerText}</a>'.format(obj);
                            }
                        }).toArray();
                        e.cellHtml = htmls.join("");
                    }
                });
                var state = mini.get(gridid + "_state").getValue();
                var obj = { filterFields: filterFields, filterValues: filterValues, searchFields: searchFields, searchOperators: searchOperators, searchValues: searchValues, qs: mini.encode($.url().param()), viewstate: state, of: window.orderFields, ov: window.orderValues };
                if ((grid.firstCommand || grid.firstcommand) === "search" && !window.filterFields && !window.searchFields) {
                    setTimeout(function () {
                        $($("#" + gridid).parents(".dd-datagrid-panel").find(".mini-button[data-command=search]")[0]).click();
                    }, 100);
                } else {
                    grid.load(obj);
                }
                if (grid.multisort === "true" || grid.multisort === "True") {
                    var sorter = new MultiSort(grid);
                }
                grid.fixColumn = grid.fixColumn || grid.fixcolumn;
                if (grid.fixColumn) {
                    grid.frozenColumns(0, parseInt(grid.fixColumn) + jslinq(mini.ddGrids[0].columns).where(function (c) { return c.type == 'checkcolumn' || c.type == 'indexcolumn' }).Count());
                }
                if (grid.showfilterrow) {
                    $("#" + grid.id).find(".dd-datagrid-filteredit").each(function (index, item) {
                        var filter = mini.get(item.id);
                        var sf = item.id.substring(44);
                        var column = grid.getColumn(sf);
                        if (filter.setFilterData) filter.setFilterData(jslinq(window.ddGetSearchOperator(grid.getColumn(sf))).where(function (item) { return item.cnt != 2 }).toArray());
                        if (filter.setFilterValue) filter.setFilterValue(column.so || '0');
                        if (filter.setValue && window.searchObject[sf]) filter.setValue(window.searchObject[sf]);
                    });
                }
                function onDatagridLoad(e) {
                    var result = grid.getResultObject();
                    if (result.script) eval(result.script);
                    if (result.message) $("#" + gridid + "_status").css('display', 'inline-block').text(result.message);
                    if (grid.StoreColumnsChanged === "true") {
                        var setting = (store.get("DdDataGridColumn") || {})[grid.id];
                        if (setting) {
                            $.each(setting, function (idx, item) {
                                grid.updateColumn(item.name, item);
                            });
                        }
                    }
                    if (grid.ddBeginEditTable) grid.ddBeginEditTable();
                    if (!result.total) {
                        grid.setShowEmptyText(true);
                    }
                    if (grid.mergedcolumns) {
                        grid.mergeColumns(grid.mergedcolumns.split(','));
                    }
                    if (window.parent && window.parent.$ && window.parent.$(".dd-fsmgrid-panel[rel],.dd-gridtab-panel[rel]").length) {
                        window.parent.Dengdu.updatePage.update();
                    }
                }
                function onDatagridPreLoad(e) {
                    if (typeof (e.data[0]) === "string") {
                        if (grid.type == 'treegrid') {
                            e.data = mini.arrayToTree(formDataBase64ToJson(e.data[0]), null, grid.idField, grid.parentField);
                        }
                        else {
                            e.data = formDataBase64ToJson(e.data[0]);
                        }
                    }
                }
                function onDatagridLoadError(e) {
                    Dengdu.ajaxSuccess(e.xhr.responseText);
                }
            });

            Dengdu.ddGridButton = function () {
                $(document.body).on("click", ".dd-gridbutton", function (e) {
                    e.preventDefault(); var $this = $(this);
                    var buttonid = $this.attr("buttonid") || $this.attr("id"); var button = mini.get(buttonid); var gridid = button.gridid;
                    var async = button.async ? !['0', 'false'].contains(button.async.toLowerCase()) : true; var isfsm = $(this).hasClass("dd-gridbutton-fsm");
                    var selector = '#{0}'.format(gridid);
                    var div = $(selector);
                    var isform = div.hasClass('dd-form');
                    var grid = isform ? new Dengdu.Form(selector) : mini.get(gridid);
                    if (isform && isfsm && button.nonevalidate != "1") {
                        var errs = Dengdu.mini.validateForm(grid);
                        if (errs) return;
                    }
                    var href = button.href; var target = button.target;
                    if (!href && (target != "_zip" && target != "_file" && target != "_back")) {
                        href = '/core/upython/button/{0}'.format(buttonid.toLowerCase());
                        button.href = href;
                    }                    
                    var needselect = button.needselect != "0"; var needconfirm = button.needconfirm != "0";
                    var rows = (function () {
                        if (isform) {
                            return [$.extend(formDataBase64ToJson(div.attr("srcdata")).data, grid.getData())];
                        }
                        else {
                            return $this.attr("rowid") ? [grid.getRowByUID(parseInt($this.attr("rowid")))] : grid.getSelecteds();
                        }
                    })();
                    if (needselect) {
                        if (rows.length == 0) {
                            mini.alert($.t("missingRecord"));
                            return;
                        }
                    }
                    else {
                        if (isfsm && !isform && rows.length == 0) {
                            rows = grid.getData();
                        }
                    }
                    if (needconfirm) {
                        var confirmTexts = Dengdu.coalesce(button.confirmtext, $.t("confirmMessage")).split("|");
                        for (i = 0; i < confirmTexts.length; i++) {
                            if (!confirm(confirmTexts[i])) return;
                        }
                    }
                    var vtime = true;
                    if (!isform) {
                        if (grid.editMode == 'table') {
                            grid.commitEdit();
                            if (grid.ddBeginEditTable) grid.ddBeginEditTable();
                        }
                        var changes = grid.getChanges();
                        if (changes.length > 0) {
                            grid.ddSave(changes, button, function (msg) {
                                if (msg.success) {
                                    vtime = false;
                                    if (button) button.enable();
                                    doclick();
                                }
                            });
                        }
                        else {
                            doclick();
                        }
                    }
                    else {
                        doclick();
                    }
                    function doclick() {
                        var filteredRows = rows;
                        var columns = GetColumns(button.filterfields);
                        if (button.filterfields) {
                            filteredRows = GetData(rows, button.filterfields);
                        }
                        if (target == '_back') {
                            history.back();
                        }
                        if (target == '_sql') {
                            var postobj = { ff: filterFields, fv: filterValues };
                            postobj.data = mini.encode(filteredRows);
                            postobj.vtime = vtime;
                            Dengdu.gridAjax(grid, href, postobj, async, button);
                        }
                        if (target == '_input') {
                            if (!button.href) {
                                alert($.t("missingUrl")); return;
                            }
                            var getobj = {};
                            var open = {};
                            if (typeof button.open == "string") {
                                getobj = { data: button.open };
                                open = JSON.decode(button.open);
                            }
                            else {
                                getobj = { data: JSON.encode(button.open) };
                                open = button.open;
                            }
                            var url = '/core/uform/open?' + $.param(getobj);
                            mini.open({
                                url: url,
                                title: ((needselect || isfsm) ? $.t("SelectedRecords").format(filteredRows.length) + $.t(",") : "") + Dengdu.coalesce(open.title, $.t("inputParameter")),
                                width: getModalWidth(open.width || grid.modalWidth),
                                height: getModalHeight(open.height || grid.modalHeight),
                                onload: function () {
                                    var iframe = this.getIFrameEl();
                                    if (filteredRows && filteredRows[0])
                                        iframe.contentWindow.SetData(filteredRows[0]);
                                },
                                ondestroy: function (action) {
                                    if (action == "ok") {
                                        var iframe = this.getIFrameEl(); var opendata = iframe.contentWindow.GetData(); opendata = mini.clone(opendata);
                                        if (opendata) {
                                            var postobj = { ff: filterFields, fv: filterValues, args: JSON.encode(opendata) };
                                            postobj.vtime = vtime;
                                            postobj.data = JSON.encode(filteredRows);
                                            if (href)
                                                Dengdu.gridAjax(grid, href, postobj, async, button);
                                            else grid.reload();
                                        }
                                    }
                                },
                                allowResize: false
                            });
                        }

                        if (target == '_form') {
                            if (!button.href) {
                                alert($.t("missingUrl")); return;
                            }
                            var obj = (filteredRows && filteredRows[0]) ? filteredRows[0] : {};
                            obj = $.extend({}, window.filterObject, obj);
                            var url = href.format(obj);
                            var getobj = {};
                            var open = {};
                            if (button.open) {
                                if (typeof button.open == "string") {
                                    getobj = { data: button.open };
                                    open = JSON.decode(button.open);
                                }
                                else {
                                    getobj = { data: JSON.encode(button.open) };
                                    open = button.open;
                                }
                            }
                            mini.open({
                                url: url,
                                title: ((needselect || isfsm) ? $.t("SelectedRecords").format(filteredRows.length) + $.t(",") : "") + Dengdu.coalesce(open.title, $.t("inputParameter")),
                                width: getModalWidth(open.width || grid.modalWidth),
                                height: getModalHeight(open.height || grid.modalHeight),
                                onload: function () {
                                    var iframe = this.getIFrameEl();                                    
                                    if (filteredRows && filteredRows[0]) {
                                        var data = {};
                                        data.action = "edit";
                                        filteredRows[0].data = mini.encode(filteredRows);
                                        data.row = filteredRows[0];                                       
                                        iframe.contentWindow.SetData(data);
                                    }
                                },
                                ondestroy: function (action) {
                                    grid.reload();
                                },
                                allowResize: false
                            });
                        }

                        if (target == '_open') {
                            var obj = (filteredRows && filteredRows[0]) ? filteredRows[0] : {};
                            obj = $.extend({}, window.filterObject, obj);
                            var url = href.format(obj);
                            var open = JSON.decode(Dengdu.coalesce(button.open, "{}"));
                            mini.open({
                                url: url,
                                title: Dengdu.coalesce(open.title, button.getText(), $.t("open")),
                                width: getModalWidth(open.width || grid.modalWidth),
                                height: getModalHeight(open.height || grid.modalHeight),
                                ondestroy: function (action) {
                                    grid.reload();
                                },
                                allowResize: false
                            });
                        }

                        if (target == '_audit') {
                            var gridpanel = $this.closest("div[rel]");
                            var rel = Dengdu.coalesce(button.rel, gridpanel.attr("rel"));
                            var pk = gridpanel.attr("pk");
                            function do_audit(row) {
                                var obj = $.extend({}, window.filterObject, row);
                                var href_open = href;
                                if (href.startsWith("/core/upython/button")) {
                                    href_open = "/core/uform/modify/{0}?ff={1}&fv={2}&nextonsave=1".format(rel, pk, obj[pk]);
                                }
                                var url = href_open.format(obj);
                                var open = JSON.decode(Dengdu.coalesce(button.open, "{}"));
                                mini.open({
                                    url: url,
                                    title: Dengdu.coalesce(open.title, button.getText(), $.t("open")),
                                    width: getModalWidth(open.width || grid.modalWidth),
                                    height: getModalHeight(open.height || grid.modalHeight),
                                    ondestroy: function (action) {
                                        if (action == 'next') {
                                            grid.ddGetNext(row, function (nextrow) {
                                                if (nextrow) do_audit(nextrow);
                                                else grid.reload();
                                            });
                                        }
                                        else {
                                            grid.reload();
                                        }
                                    },
                                    allowResize: false
                                });
                            }
                            var obj = (filteredRows && filteredRows[0]) ? filteredRows[0] : grid.data[0];
                            do_audit(obj);
                        }

                        if (['_fffv', '_data', '_param', '_format', '_tab'].contains(target)) {
                            var obj = {};
                            if (target == '_fffv') {
                                obj.ff = columns.join(","); obj.fv = $.map(columns, function (column) { return filteredRows[0][column] }).join(",");
                            }
                            if (target == '_data') {
                                obj.data = mini.encode(filteredRows);
                            }
                            if (target == '_param' || target == '_format' || target == '_tab') {
                                obj = filteredRows[0] || {};
                            }
                            if (target != '_format' && target != '_tab') {
                                if (button.tf) {
                                    var ds = rows[0];
                                    obj.title = $.map(button.tf.split(','), function (item) { return ds[item]; }).join("-");
                                }
                                if (target == '_data') {
                                    if (grid.getLoadParams) {
                                        var ps = grid.getLoadParams(); delete ps.viewstate;
                                        obj.loadParams = mini.encode(ps);
                                    }
                                    Dengdu.createFormSubmit(href, obj);
                                }
                                else {
                                    Dengdu.createFormSubmit(href, obj, 'get');
                                }
                            } else {
                                obj = $.extend({}, window.filterObject, obj);
                                var newhref = href.format(obj);
                                if (target == '_format') {
                                    Dengdu.createFormSubmit(newhref, {}, 'get');
                                }
                                else {
                                    var node = { id: $.md5(newhref), text: (button.title && button.title.format(obj)) || button.getText(), iconCls: button.iconCls, url: newhref };
                                    if (window.top.Dengdu && window.top.Dengdu.NavTab) {
                                        window.top.Dengdu.NavTab.showTab(node);
                                    }
                                    else {
                                        Dengdu.createFormSubmit(newhref, {}, 'get');
                                    }
                                }
                            }
                        }
                        if (target == '_blank' || target == "_self") {
                            var obj = (filteredRows && filteredRows[0]) ? filteredRows[0] : {};
                            obj = $.extend({}, window.filterObject, obj);
                            var newhref = href.format(obj);
                            Dengdu.createFormSubmit(newhref, {}, 'get', target);
                        }

                        if (target == '_zip') {
                            var gridpanel = $this.closest("div[rel]");
                            var rel = Dengdu.coalesce(button.rel, gridpanel.attr("rel"));
                            var pk = gridpanel.attr("pk");
                            mini.open({
                                url: '/core/uform/fileselect/' + rel,
                                title: $.t("select"),
                                width: getModalWidth(400),
                                height: getModalHeight(400),
                                ondestroy: function (action) {
                                    if (action == "ok") {
                                        var iframe = this.getIFrameEl(); var opendata = iframe.contentWindow.GetData(); opendata = mini.clone(opendata);
                                        if (opendata) {
                                            var obj = { rel: rel, attname: opendata, data: JSON.encode(filteredRows) };
                                            Dengdu.createFormSubmit('/core/uform/ZipDownload', obj);
                                        }
                                    }
                                },
                                allowResize: false
                            });
                        }

                        if (target == '_file') {
                            var gridpanel = $this.closest("div[rel]");
                            var rel = Dengdu.coalesce(button.rel, gridpanel.attr("rel"));
                            var pk = gridpanel.attr("pk");
                            mini.open({
                                url: '/core/uform/fileselect/' + rel,
                                title: $.t("select"),
                                width: getModalWidth(400),
                                height: getModalHeight(400),
                                ondestroy: function (action) {
                                    if (action == "ok") {
                                        var iframe = this.getIFrameEl(); var opendata = iframe.contentWindow.GetData(); opendata = mini.clone(opendata);
                                        if (opendata) {
                                            var obj = { rel: rel, attname: opendata, data: JSON.encode(filteredRows) };
                                            Dengdu.createFormSubmit('/core/uform/FileDownload', obj);
                                        }
                                    }
                                },
                                allowResize: false
                            });
                        }

                        function GetColumns(select) {
                            if (select) {
                                var sArray = select.split(","); var obj = new Array();
                                for (var i = 0; i < sArray.length; i++) {
                                    var map = sArray[i].split("-"); if (map.length == 1) map[1] = map[0];
                                    obj[i] = map[1];
                                }
                                return obj;
                            }
                            else return select;
                        }

                        function GetData(rows, select) {
                            //rows:Array,select:string("p1-a,p2-b")
                            if (!rows) return rows; if (!select) { return rows; }
                            var obj = new Array(); var sArray = select.split(",");
                            for (var r = 0; r < rows.length; r++) {
                                var tmp = {};
                                for (i = 0; i < sArray.length; i++) {
                                    var map = sArray[i].split("-"); if (map.length == 1) map[1] = map[0];
                                    tmp[map[1]] = rows[r][map[0]];
                                }
                                obj[r] = tmp;
                            }
                            return obj;
                        }
                    };
                });
                $(document.body).on("click", ".dd-rowbutton", function () {
                    var obj = $(this).attrs();
                    if (obj.buttonid) {
                        obj.button = mini.get(obj.buttonid);
                    }
                    DatagridMenuItemClick(obj.gridid, obj.command, obj.button, obj.rowid);
                });
            }

            Dengdu.ddGridButton();

            $(".dd-form.modify a.mini-button[target='_ajaxsubmit']").click(function (e) {
                e.preventDefault();
                var button = mini.get($(this).attr("id"));
                if (!button.enabled) return;
                var div = $(this).closest(".dd-form.modify"); var isCrypto = (div.attr("crypto") || "true") == "true";
                var formid = div.attr("id");
                var form = new Dengdu.Form("#" + formid);
                var formdata = form.getData();
                var rel = div.attr("rel");
                if (button.command != "delete" && button.nonevalidate != "1") {
                    var errs = Dengdu.mini.validateForm(form);
                    if (errs) return;
                }
                var button_text = button.getText(); button.disable(); button.setText($.t("Processing") + "...");
                var message = formDataBase64ToJson(div.attr("srcdata"));
                if (!message.success) window.location.href = "/core/error?tips={0}".format(message.message);
                var srcdata = message.data;
                if (srcdata._state == "added") {
                    $.extend(srcdata, $.url().param(), formdata);
                }
                else {
                    $.extend(srcdata, formdata);
                }
                if (button.command == "delete") {
                    srcdata._state = "removed";
                }
                var json = mini.encode([srcdata]);
                if (isCrypto) json = window.rsaEncrypt(json);
                var dop = button.dop;
                if (!dop) {
                    var c = mini.get(formid + "_state");
                    if (c) dop = c.getValue();
                }
                if (button.needconfirm) {
                    var confirmText = button.confirmtext || $.t("confirmMessage");
                    if (!confirm(confirmText)) {
                        button.setText(button_text); button.enable();
                        return;
                    }
                }
                var url = Dengdu.coalesce(button.href, Dengdu.uformPath + "save/" + rel);
                if (url.toLowerCase().indexOf('/core/uform/fsm') !== -1 && srcdata._state === 'added') {
                    alert($.t("submitUnsaved"));
                    return;
                }
                Dengdu.asyncAjax(url, { viewstate: dop, data: json, reload: srcdata._state === "modified" ? 0 : 1 }, function (text) {
                    var msg = mini.decode(text);
                    if (srcdata._state === "modified" && msg.reload === 0 && msg.success) {
                        srcdata["updatedtime"] = msg.time;
                        var control = mini.get("updatedtime");
                        if (control) control.setValue(msg.time);
                        div.attr("srcdata", mini.encode({ success: 1, data: srcdata }));
                        if (window.CloseOwnerWindow && $.url().param().closeonsave) {
                            msg.data = srcdata;
                            return window.CloseOwnerWindow(msg);
                        }
                    }
                    if ((srcdata._state === "added" || srcdata._state == "removed") && msg.success) {
                        (function () {
                            if (window.timer) clearInterval(window.timer);
                            var storeKey = "dd.form.create.{0}".format(rel);
                            store.remove(storeKey);
                        })();
                        if (window.CloseOwnerWindow && $.url().param().closeonsave) {
                            msg.data = srcdata;
                            return window.CloseOwnerWindow(msg);
                        } else {
                            window.location.href = msg.href || "/core/uform/index/{0}".format(rel);
                        }
                    }
                    button.setText(button_text); button.enable();
                });
            });

            $("form .dd-button[target=_submit]").click(function () {
                e.preventDefault(); var href = $(this).attr('href'); var form = $(this).closest("form"); var formid = form.attr("id");
                form.attr(Dengdu.coalesce(form.attr('action'), href)); var miniForm = new Dengdu.Form("#" + formid); miniForm.validate();
                if (form.isValid() === false) return; form.submit();
            });

            $("form .dd-button[target=_ajaxsubmit]").click(function (e) {
                e.preventDefault(); var href = $(this).attr('href'); var form = $(this).closest("form"); var formid = form.attr("id");
                var url = Dengdu.coalesce(form.attr('action'), href); var miniForm = new Dengdu.Form("#" + formid); miniForm.validate();
                if (miniForm.isValid() === false) return; var data = miniForm.getData(); var json = mini.encode(data); Dengdu.ajax(url, data);
            });

            $(".dd-button[target=_ajax]").click(function (e) {
                e.preventDefault(); var sender = mini.get(this.id); var url = $(this).attr('href');
                Dengdu.ajax(url, sender.data ? mini.decode(data) : {});
            });

            $(".dd-cfmbtn[target=_ajax]").click(function (e) {
                e.preventDefault(); var sender = mini.get(this.id); var url = $(this).attr('href');
                if (confirm(Dengdu.coalesce(sender.cfmtxt, $.t("confirmMessage")))) {
                    Dengdu.ajax(url, sender.data ? mini.decode(data) : {});
                }
            });

            $(".dd-gridbutton").removeAttr('href');

            function setFormHorizontal() {
                $(".dd-form").each(function () {
                    var $this = $(this); var $container = $this.parent(); var width = $container.width();
                    if (width < 992) {
                        $this.addClass("dd-form-horizontal");
                    }
                    else {
                        $this.removeClass("dd-form-horizontal");
                    }
                });
            }
            setFormHorizontal();
            $(window).resize(function () {
                setFormHorizontal();
            });

            $('.mini-tabs-leftButton').on('click', function (e) {
                e.stopPropagation();
                $('.mini-tabs-headers').scrollLeft($('.mini-tabs-headers').scrollLeft() - 50)
            });
            $('.mini-tabs-rightButton').on('click', function (e) {
                e.stopPropagation();
                $('.mini-tabs-headers').scrollLeft($('.mini-tabs-headers').scrollLeft() + 50)
            });
            if (history.length < 2) {
                $('.dd-gridbutton[target=_back]').each(function () {
                    var buttonid = $(this).attr("id");
                    mini.get(buttonid).disable();
                });
            }

            $("div.dd-form[rel][meta-editor=true] div.dd-element label").contextmenu(function (e) {
                e.preventDefault(); var $this = $(this); var rel = $this.parents("div.dd-form").attr("rel"); var attname = $this.attr("for").split("$")[0];
                mini.open({
                    showMaxButton: true, height: 600, width: 960, url: '/www/dd/form/meta-editor?formname={0}&attname={1}'.format(rel, attname), title: $.t("edit"),
                    ondestroy: function (action) {
                        if (action !== 'close') {
                            var row = mini.decode(action);
                            $this.text(row.name);
                            $this.parents(".dd-element").find(".dd-element-tips").html(row.hinttext);
                        }
                    },
                    allowResize: false
                });
            });
            $("div.dd-form[rel][meta-editor=true] div.dd-form-name").contextmenu(function (e) {
                e.preventDefault(); var $this = $(this); var rel = $(this).parents("div.dd-form").attr("rel");
                mini.open({
                    showMaxButton: true, height: 600, width: 960, url: '/www/dd/form/meta-editor?formname={0}'.format(rel), title: $.t("edit"),
                    ondestroy: function (action) {
                        if (action !== 'close') {
                            var row = mini.decode(action);
                            $this.find(".dd-form-title").text(row.name);
                            $this.find(".dd-form-desc").html(row.hinttext);
                        }
                    },
                    allowResize: false
                });
            });
        }, 9000);
    });
});