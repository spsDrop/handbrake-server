#!/usr/bin/env node
var express = require('express'),
    YUI = require("yui3").YUI,
    cp = require("child_process"),
    fs = require("fs"),
    path = require("path");

var app = module.exports = express.createServer(),
    appPath = process.argv[1].match(/^(.*)\/[^\/]+$/)[1];
    
process.chdir(appPath);

// Configuration

app.configure(function(){
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
    app.use(express.session({ secret: "monkey wrench" }));
    app.use(app.router);
    app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
    app.use(express.errorHandler()); 
});

// Routes

YUI().use("json","substitute",function(Y){
    
    var rootFolder = "/storage/Video",
        outputFolder = "/storage/Video",
        profiles = {
            "high-profile":"-i {inputFile} -o {outputFile}.mp4  -e x264 -q 20.0 -a 1,1 -E copy:ac3,faac -B 160,160 -6 auto,dpl2 -R Auto,Auto -D 0.0,0.0 -f mp4 --detelecine --decomb --loose-anamorphic -m -x b-adapt=2:rc-lookahead=50",
            "android-tablet":"-i {inputFile} -o {outputFile}.m4v  -e x264 -q 20.0 -r 30 --pfr  -a 1 -E faac -B 160 -6 dpl2 -R Auto -D 0.0 -f mp4 -4 -X 1280 --loose-anamorphic -m",
            "universal":"-i {inputFile} -o {outputFile}.mp4  -e x264 -q 20.0 -a 1,1 -E faac,copy:ac3 -B 160,160 -6 dpl2,auto -R Auto,Auto -D 0.0,0.0 -f mp4 -X 720 --loose-anamorphic -m -x cabac=0:ref=2:me=umh:bframes=0:weightp=0:8x8dct=0:trellis=0:subme=6",
            "ipod":"-i {inputFile} -o {outputFile}.mp4  -e x264 -b 700 -a 1 -E faac -B 160 -6 dpl2 -R Auto -D 0.0 -f mp4 -I -X 320 -m -x level=30:bframes=0:weightp=0:cabac=0:ref=1:vbv-maxrate=768:vbv-bufsize=2000:analyse=all:me=umh:no-fast-pskip=1:subme=6:8x8dct=0:trellis=0",
            "iphone+ipod-touch":"-i {inputFile} -o {outputFile}.mp4  -e x264 -q 20.0 -a 1 -E faac -B 128 -6 dpl2 -R Auto -D 0.0 -f mp4 -X 480 -m -x cabac=0:ref=2:me=umh:bframes=0:weightp=0:subme=6:8x8dct=0:trellis=0",
            "iphone-4":"-i {inputFile} -o {outputFile}.mp4  -e x264 -q 20.0 -r 29.97 --pfr  -a 1 -E faac -B 160 -6 dpl2 -R Auto -D 0.0 -f mp4 -4 -X 960 --loose-anamorphic -m",
            "ipad":"-i {inputFile} -o {outputFile}.mp4  -e x264 -q 20.0 -r 29.97 --pfr  -a 1 -E faac -B 160 -6 dpl2 -R Auto -D 0.0 -f mp4 -4 -X 1024 --loose-anamorphic -m",
            "apple-tv":"-i {inputFile} -o {outputFile}.mp4  -e x264 -q 20.0 -a 1,1 -E faac,copy:ac3 -B 160,160 -6 dpl2,auto -R Auto,Auto -D 0.0,0.0 -f mp4 -4 -X 960 --loose-anamorphic -m -x cabac=0:ref=2:me=umh:b-pyramid=none:b-adapt=2:weightb=0:trellis=0:weightp=0:vbv-maxrate=9500:vbv-bufsize=9500",
            "apple-tv-2":"-i {inputFile} -o {outputFile}.mp4  -e x264 -q 20.0 -a 1,1 -E faac,copy:ac3 -B 160,160 -6 dpl2,auto -R Auto,Auto -D 0.0,0.0 -f mp4 -4 -X 1280 --loose-anamorphic -m",
            "normal":"-i {inputFile} -o {outputFile}.mp4  -e x264 -q 20.0 -a 1 -E faac -B 160 -6 dpl2 -R Auto -D 0.0 -f mp4 --strict-anamorphic -m -x ref=2:bframes=2:subme=6:mixed-refs=0:weightb=0:8x8dct=0:trellis=0",
            "classic":"-i {inputFile} -o {outputFile}.mp4  -b 1000 -a 1 -E faac -B 160 -6 dpl2 -R Auto -D 0.0 -f mp4"
        },
        handbrake,
        config = {
            jobs:{},
            queue:[],
            doneQueue:[],
            currentJobID:null
        };
        
    var Job = function(spath, profileID){
        this.sourcePath = spath;
        this.profile = profileID;
        this.name = path.basename(spath);
        this.outputPath = spath.replace(rootFolder,outputFolder).replace(path.extname(spath),"");
        this.args = profiles[profileID].split(" ");
        this.args[1] = Y.substitute(this.args[1],{inputFile:this.sourcePath});
        this.args[3] = Y.substitute(this.args[3],{outputFile:this.outputPath});
        this.complete = false;
        this.progress = 0;
        this.status = "created";
        this.id = Y.stamp(this);
    };
    
    var init = function(){
        loadConfig(function(){
           checkJobs();
        
            if (!module.parent) {
                app.listen(8181);
                console.log("Express server listening on port %d", app.address().port);
            } 
        });
    };
    
    var addJob = function(path, profileID,cb){
        cb = cb || function(){};
        validatePath(path,function(check){
            if(!check.success){
                return;
            }else{
                if(!profiles[profileID]){
                    cb({success:false,msg:"Not a valid profileID"});
                    return;
                }
                var job = new Job(path, profileID);
                if(job.sourcePath.indexOf(rootFolder) !== 0){
                    cb({success:false,msg:"Path not in within root path"});
                    return;
                }
                config.jobs[job.id] = job;
                config.queue.push(job.id);
                job.status = "Queued";
                saveConfig(function(){
                    if (config.queue.length > 0 && config.currentJobID === null){
                        startJob(config.queue[0]);
                    }
                    cb({success:true,msg:"Job Added", jobID:job.id});
                    return;
                });
            }
        });
    };
    
    var removeJob = function(jobID){
        if(jobID == config.currentJobID && handbrake && handbrake.pid){
            handbrake.kill("SIGINT");
            config.jobs[config.currentJobID].status = "Terminated by user";
            saveConfig();
            return {success:true,msg:"Killed job"};
        }else if(config.queue.indexOf(jobID) > -1){
            config.queue.splice(config.queue.indexOf(jobID),1);
            config.jobs[jobID].status = "Canceled";
            saveConfig();
            return {success:true,msg:"Removed job"};
        }
        return {success:false,msg:"Job not in Queue"};
    };
    
    var checkJobs = function(){
        if(config.queue.length && (!config.currentJobID || !handbrake)){
            startJob(config.queue[0]);
        }
    };
    
    var mkdirP = function(p, mode, f) {
        var cb = f || function () {};
        if (p.charAt(0) != '/') { cb('Relative path: ' + p); return; }
        
        var ps = path.normalize(p).split('/');
        path.exists(p, function (exists) {
            if (exists) cb(null);
            else mkdirP(ps.slice(0,-1).join('/'), mode, function (err) {
                if (err && err.errno != process.EEXIST){
                    cb(err);
                }else{
                    fs.mkdir(p, mode, cb);
                }
            });
        });
    };
    
    var startJob = function(jobID){
        if(!handbrake || handbrake.pid === null){
            mkdirP(path.dirname(config.jobs[jobID].outputPath),0777);
            
            config.currentJobID = jobID;
            handbrake = cp.spawn("HandBrakeCLI",config.jobs[jobID].args);
            handbrake.stdout.on("data",update);
            handbrake.stderr.on("data",update);
            handbrake.on("exit",onComplete);
        }else{
            index = config.queue.indexOf(jobID);
            if(index < 0){
                config.queue.shift(jobID);
            }else{
                config.queue.shift(config.queue.splice(index,1));
            }
        }
    };
    
    var update = function(data){
        config.jobs[config.currentJobID].status = data.toString();
    };
    
    var onComplete = function(code){
        var job = config.jobs[config.currentJobID];
        job.status = "Handbrake Completed";
        config.queue.shift(config.currentJobID);
        config.currentJobID = null;
        saveConfig();
        checkJobs();
    };
    
    var saveConfig = function(cb){
        cb = cb || function(){};
        fs.writeFile("./config.json",Y.JSON.stringify(config),function(err){
            if(err){
                Y.log("Error saving config","error");
            }else{
                cb();
            }
        });
    };
    
    var loadConfig = function(cb){
        cb = cb || function(){};
        fs.realpath("./config.json",function(err){
            if(err){
                saveConfig(function(){
                    loadConfig(cb);
                });
            }else{
                fs.readFile("./config.json",function(err,data){
                    config = Y.JSON.parse(data);
                    cb();
                });
            }
        });
    };
    
    var validatePath = function(path,callback){
        callback = callback || function(){};
        if(!path){
            callback({success:false,msg:"Please provide a path"});
            return;
        }
        if(path[0] != '/'){
            callback({success:false,msg:"Not an absolute path"});
            return;
        }
        fs.realpath(path,function(err){
            if(err){
                callback({success:false,msg:"Not a valid path"});
            }else{
                callback({success:true});
            }
        });
    };
    
    var addFolder = function(path,profile,cb){
        cb = cb || function(){};
        var check = validatePath(path,function(check){
            if(!check.success){
                cb([check]);
            }else{
                findAllMediaFiles(path,function(files){
                    msgs = [];
                    if(files.length){
                        Y.log("Found "+files.length+" media files");
                        var n = files.length;
                        files.forEach(function(file){
                            addJob(file,profile,function(msg){
                                Y.log("Pushing job: "+file);
                                msgs.push(msg);
                                n--;
                                Y.log(n);
                                if(n === 0){
                                    cb(msgs);
                                }
                            })
                        });
                    }else{
                        cb([{success:false,msg:"No suitable files found"}]);
                    }
                });
            }
        });
        
        
    };
    
    var isRightFileType = function(extn){
        return (extn == 'mkv' || extn == 'avi' || extn == 'mp4');
    };
    
    var findAllMediaFiles = function(path,cb){
        cb = cb || function(){};
        var rightFiles = [];
        fs.readdir(path,function(err,files){
            var i = files.length;
            files.forEach(function(file){
                fs.stat(path+"/"+file,function(err,fileStat){
                    if(fileStat.isFile() && file.match(/^.*\.(.*)$/)){
                        var extn = file.match(/^.*\.(.*)$/)[1].toLowerCase();
                        if(isRightFileType(extn)){
                            rightFiles.push(path + '/' + file);
                        }
                        i--;
                        if(i === 0){
                            cb(rightFiles);
                        }
                    }
                    if(fileStat.isDirectory()){
                        var subFiles = findAllMediaFiles(path+"/"+file,function(subFiles){
                            rightFiles = rightFiles.concat(subFiles);
                        });
                        i--;
                        if(i === 0){
                            rightFiles.sort();
                            cb(rightFiles);
                        }
                    }
                });
            });
        });
		return rightFiles;
    };
    
    var flashMsgs = function(req,msgs){
        if(msgs.forEach){
            msgs.forEach(function(msg){
                if(msg.success){
                    req.flash('msgs',msg.msg);
                }else{
                    req.flash('errors',msg.msg);
                }
            });
        }
    };

    app.get('/', function(req, res){
        var queuedJobs = [],
            completedJobs = [];
        for(var n in config.jobs){
            var job = config.jobs[n];
            if(config.queue.indexOf(job.id) > -1){
                queuedJobs.push(job);
            }else{
                completedJobs.push(job);
            }
        }
        
        res.render('index', {
            title: 'Hand Brake Server',
            queuedJobs:queuedJobs,
            completedJobs:completedJobs,
            profiles:profiles,
            msgs:req.flash("msgs"),
            errors:req.flash("errors")
        });
    });
    
    app.get("/fragments/queue", function(req, res){
        var queuedJobs = [];
        
        for(var n in config.jobs){
            var job = config.jobs[n];
            if(config.queue.indexOf(job.id) > -1){
                queuedJobs.push(job);
            }
        }
        
        res.render("queue",{
            queuedJobs:queuedJobs,
            layout:false
        });
    });
    
    app.get("/fragments/complete", function(req, res){
        var completedJobs = [];
        
        for(var n in config.jobs){
            var job = config.jobs[n];
            if(config.queue.indexOf(job.id) < 0){
                completedJobs.push(job);
            }
        }
        
        res.render("complete",{
            completedJobs:completedJobs,
            layout:false
        });
    });
    
    app.get('/add/', function(req, res){
        addJob(path.normalize(req.query.path),req.query.profile,function(msg){
            Y.log(msg);
            flashMsgs(req,[msg]);
            res.redirect("home");
        });
    });
    
    app.get('/readd/:jobID', function(req, res){
        var job = config.jobs[req.params.jobID],
            msg;
        if(job){
            if(config.queue.indexOf(job.id) < 0){
                config.queue.push(job.id);
                job.status = "Requeued";
                checkJobs();
                saveConfig();
                msg = {success:true,msg:"Job readded"};
            }else{
                msg = {success:false,msg:"Job already in queue"};
            }
        }else{
            msg = {success:false,msg:"Job not found"};
        }
        
        flashMsgs(req,[msg]);
        res.redirect("home");
    });
    
    app.get('/add-folder/', function(req, res){
        addFolder(path.normalize(req.query.path),req.query.profile,function(msgs){
            flashMsgs(req,msgs);
            res.redirect("home");
        });
        
    });
    
    app.get('/remove/:jobID', function(req, res){
        var response = removeJob(req.params.jobID);
        flashMsgs(req,[response]);
        res.redirect("home");
    });
    
    init();
});