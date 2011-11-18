YUI().use("node-load", "io", "json", "node-event-delegate",'autocomplete', 'autocomplete-highlighters', function(Y){
    var HandBrake = function(el){
        var messages = el.one(".messages"),
            queue = el.one("li.job-queue.ready"),
            complete = el.one("li.job-queue.complete");
        
        var init = function(){
            setInterval(updateLists, 5000);
            Y.one("body").delegate("click", function(e){
                e.preventDefault();
                getJSON("/json"+e.currentTarget.getAttribute("href"));
            },"a");
            Y.all("form").on("submit",function(e){
                e.preventDefault();
                var form = e.currentTarget;
                getJSON("/json"+form.getAttribute("action"), form);
            })
        };

        var getJSON = function(url, form){
            Y.io(url,{
                method:"GET",
                form:form ? {id:form} : form,
                on:{success:function(id,response){
                    var msgs = Y.JSON.parse(response.responseText);
                    messages.empty();
                    if(msgs.length){
                        Y.Array.each(msgs,function(msg){
                            writeMessage(msg);
                        });
                    }else{
                        writeMessage(msgs);
                    }
                    updateLists();
                }}
            });
        };

        var writeMessage = function(msg){
            Y.Node.create("<li></li>")
                .set("text",msg.msg)
                .addClass(msg.success ? "" : "error")
                .appendTo(messages);
        };
        
        var updateLists = function(){
            queue.load("/fragments/queue");
            complete.load("/fragments/complete");
        };
        
        init.apply(this);
    };

    Y.on("domready", function(){
        Y.all(".hand-brake").each(function(el){
            new HandBrake(el);
        });
        Y.all(".folder-search").each(function(el){
            el.plug(Y.Plugin.AutoComplete, {
                resultHighlighter: 'phraseMatch',
                resultListLocator: 'results',
                resultTextLocator: 'path',
                source: '/json/folder-search?path={query}',
                activateFirstItem:true
            });
            var forceUpdate = function(e){
                el.ac.sendRequest(e.result ? e.result.text : el.get("value"));
            };
            el.on("focus", forceUpdate);
            el.ac.on("select", forceUpdate);
        })
    });
});