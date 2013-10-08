var Emitter = require('events').EventEmitter,
    path = require('path'),
    im = require('imagemagick');

/*
 * filesystem storage
 * - save request.files to uploadPath
 * - if request.files.each has many versions
 *    process each version
 *    store each version to uploadPath
 *
 * aws storage
 * - upload request.files to s3
 * - if request.files.each has many versions
 *    process each version
 *    store to each version to s3
 */
var Storage = require('./storage');
var FileSystemStorage = Storage.FileSystemStorage,
    AwsStorage = Storage.AwsStorage;

function generateNameWithExt(file) {
  var name = '';
  for (var i = 0; i < 32; i++) {
    name += Math.floor(Math.random() * 16).toString(16);
  }
  name += path.extname(file);

  return name;
}

function generateNameWithVersion(file, version) {
  var extname = path.extname(file);
  return path.basename(file, extname) + "-" + version + extname;
}

function hasFiles(request) {
  return request.files && Object.keys(request.files).length > 0;
}

module.exports = function(options) {
  var uploadPath = options.path;
  var versions = options.versions || {};

  var emitter = new Emitter();
  var storage;

  if (options.storage && options.storage.name === "aws") {
    storage = new AwsStorage(options.storage.options);
  }
  else {
    storage = new FileSystemStorage(uploadPath);
  }

  return processUpload;

  function processUpload(req, res, next) {
    if (hasFiles(req)) {

      var counter = Object.keys(req.files).length;

      emitter.on('save', function() {
        counter -= 1;
        // console.log("Successfully saved, remain: %d", counter);
        if (counter === 0) {
          next();
        }
      });

      var end = res.end;
      res.end = function(data, encoding) {
        end.call(res, data, encoding);
        // console.log('Process versions ====>');
        // process different versions
        for(var key in req.files) {
          var file = req.files[key];
          if (Object.keys(file.versions).length > 0 ) {
            for(var type in file.versions) {
              processVersion(file, type);
            }
          }
        }
      };

      for(var key in req.files) {
        var file = req.files[key];

        // set versions for resizing
        file.versions = versions;
        counter += Object.keys(versions).length;

        storage.save(file, mainFileStorageHandler(file, next));
      }
    }
    else {
      next();
    }
  }

  function mainFileStorageHandler(file, next) {
    return function(err, dest) {
      if (err) {
        next(err);
      }
      else {
        file.uri = dest;

        emitter.emit('save');
      }
    };
  }

  function processVersion(file, version) {
    var size = file.versions[version];
    var destName = generateNameWithVersion(file.uri, version);
    var dest = path.dirname(file.path) + destName;

    im.resize({
        srcPath: file.path,
        dstPath: dest,
        width: size[0],
        height: size[1]
      },
      resizeHandler(dest, destName, file.type));
  }

  function resizeHandler(src, dest, type) {
    var file = { path: src, dest: dest, type: type };

    return function(err) {
      if(err) {
        //TODO handle error
        //  remove src can occur an error for testing
        // console.log("Error in resizeHandler: %s", err);
      }
      else {
        storage.save(file, function(err, dest) {
          //TODO handle error
          // console.log('Processed file: %s', dest);
        });
      }
    };
  }
};
