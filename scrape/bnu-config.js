/// <reference path="../../seajs/sea.js" />
/// <reference path="../../seajs/seajs-css.js" />
function __CreateJSPath(js) {
    var scripts = document.getElementsByTagName("script");
    var path = "";
    for (var i = 0, l = scripts.length; i < l; i++) {
        var src = scripts[i].src;
        if (!seajs._ddv) {
            seajs._ddv = $.url(src).param().v;
        }
        if (src.indexOf(js) != -1) {
            var ss = src.split(js);
            path = ss[0];
            break;
        }
    }
    var href = location.href;
    href = href.split("#")[0];
    href = href.split("?")[0];
    var ss = href.split("/");
    ss.length = ss.length - 1;
    href = ss.join("/");
    if (path.indexOf("https:") == -1 && path.indexOf("http:") == -1 && path.indexOf("file:") == -1 && path.indexOf("\/") != 0) {
        path = href + "/" + path;
    }
    return path;
}
var __root = __CreateJSPath("config.js");
var __v = "?v=" + (seajs._ddv || "0");
__root = __root.substring(0, __root.indexOf("/scripts/areas/core/"));
seajs.config({
    base: __root + "/scripts",
    alias: {
        "bootstrap": "bootstrap/js/bootstrap.min.js" + __v,
        "miniui": "miniui/miniui.js" + __v,
        "codemirror": "codemirror/lib/codemirror.js" + __v,
        "kindeditor": "kindeditor/kindeditor.js" + __v,
        "knockout": "knockout/knockout.min.js" + __v,
        "core.miniui": "areas/core/core.miniui.js" + __v,
        "core.kindeditor": "areas/core/core.kindeditor.js" + __v,
        "core.highcharts": "areas/core/core.highcharts.js" + __v,
        "core.codemirror": "areas/core/core.codemirror.js" + __v,
        "core.formcontrol": "areas/core/core.formcontrol.js" + __v,
        "core.monaco": "areas/core/core.monaco.js" + __v,
        "core.signature_pad": "areas/core/core.signature_pad.js" + __v,
        "dengdu.echarts": "dengdu/dengdu.echarts.js" + __v,
        "hubs": "/signalr/hubs"
    }
});
seajs.use('areas/core/main');