// ===================================
// `tail -f` in Node.js and WebSockets
// ===================================
var http    = require('http'),
    io      = require('socket.io'),
    spawn   = require('child_process').spawn,    
    fs      = require('fs');



var ArgumentParser = require('argparse').ArgumentParser;
var parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Tail webserver'
});

parser.addArgument(
  [ '-d', '--log-dir' ],
  {
    help: 'Dir containing logs',
    defaultValue: '/var/log/'
  }
);

parser.addArgument(
    [ '-b', '--backlog' ],
    {
        help: 'Backlog size (in bytes)',
        defaultValue: 10000
    }
);

parser.addArgument(
    [ '-p', '--port' ],
    {
        help: 'Listening port',
        defaultValue: 8000
    }
);

var args = parser.parseArgs();


var logs = [];
// look up the dir for logs

fs.readdir(args.log_dir, function(err,files){
  if(err) throw err;
  files = Array.prototype.sort.apply(files,[]);
  for(var file in files){
    file = files[file];
    if(fs.statSync(args.log_dir+file).isFile()) logs.push(file);
  }
});

// -- Node.js HTTP Server ----------------------------------------------------------
server = http.createServer(function(req, res){
  res.writeHead(200, {'Content-Type': 'text/html'})
  fs.readFile(__dirname + '/index.html', function(err, data){
    res.write(data, 'utf8');
    res.end();
  });
})
server.listen(args.port);

// -- Setup Socket.IO ---------------------------------------------------------
var io = io.listen(server);
io.set('log level', 2);

io.sockets.on('connection', function(client){
  var filename;
  var tail;
  client.json.send( { logs : logs } );
  client.on("message",function(message){
    if(message.log){
      // Stop watching the last file and send the new one

      if(tail) tail.kill();

      fs.unwatchFile(filename);
      filename = args.log_dir + message.log;
      client.json.send({filename: filename});
      
      client.json.send({clear:true});
      // send some back log
      fs.stat(filename,function(err,stats){
        if (err) throw err;
        if (stats.size == 0){
          client.json.send({clear:true});
          return;
        }
        var start = (stats.size > args.backlog)?(stats.size - args.backlog):0;
        var stream = fs.createReadStream(filename,{start:start, end:stats.size});
        stream.addListener("data", function(lines){
          lines = lines.toString('utf-8');
          lines = lines.slice(lines.indexOf("\n")+1).split("\n");
          client.json.send({ tail : lines});
        });
      });

      // watch the file now
      tail = spawn('tail', ['--follow=name', filename]);

      tail.stdout.on('data', function (lines) {
        client.json.send({ tail : lines.toString('utf-8').split("\n") });
      });

      // stop watching the file
      client.on("disconnect",function(){
        tail.kill()
      });
    }
  });
});

console.log('Log Server running now at http://[HOSTNAME]:'+args.port+'/ in your browser');
