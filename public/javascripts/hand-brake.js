YUI().use("node-load", function(Y){
    var HandBrake = function(el){
        var queue = el.one("li.job-queue.ready"),
            complete = el.one("li.job-queue.complete");
        
        var init = function(){
            setInterval(updateLists, 2000);
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
    });
});