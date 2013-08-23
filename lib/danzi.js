var Emitter = require('events').EventEmitter,
  fs = require('fs'),
  path = require('path'),
  im = require('imagemagick'),
  knox = require('knox');

/*
 * fs storage
 * - save request.files to uploadPath
 * - if request.files.each has many versions
 *    process each version
 *    store each version to uploadPath
 *
 * s3 storage
 * - upload request.files to s3
 * - if request.files.each has many versions
 *    process each version
 *    store to each version to s3
 *
 */

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

var FileSystemStorage = (function() {
  // uploadPath is absolute
  function FileSystemStorage(uploadPath) {
    this.uploadPath = uploadPath;
    fs.exists(uploadPath, function(exists) {
      if (!exists) {
        fs.mkdirSync(uploadPath, '0755');
      }
    });
  }

  // @param file - { name: "file.png", path: "/path/file.name", dest: "/dest/file.name", type: "content type" }
  //        must have name or dest, if path & dest point the same file, it will do nothing
  //
  // @param fn - a callback will receive err, dest as parameters
  FileSystemStorage.prototype.save = function(file, fn) {
    dest = file.dest || generateNameWithExt(file.name);
    dest = path.join(this.uploadPath, path.basename(dest));

    srcStream = fs.createReadStream(file.path);
    destStream = fs.createWriteStream(dest);
    srcStream.on('end', function(err) {
      fn(err, dest);
    });
    srcStream.pipe(destStream);
  };

  return FileSystemStorage;
})();

var AwsStorage = (function() {
  function AwsStorage(options) {
    this.options = {};
    this.options['key'] = options['key'];
    this.options['secret'] = options['secret'];
    this.options['bucket'] = options['bucket'];
    this.options['x-amz-acl'] = options['x-amz-acl'];
    this.uploadPath = options['path'] || '/uploads';

    this.client = knox.createClient(options);
  }

  // will callback to fn with params: err, result
  //
  // @param file - a hash like:
  //        { name: "file.png", path: "/file/path", dest: "/dest/path", type: "image/png" }
  //        must have name or dest
  AwsStorage.prototype.save = function(file, fn) {
    dest = file.dest || generateNameWithExt(file.name);
    dest = path.join(this.uploadPath, path.basename(dest));

    var headers =  {
      'Content-Type': file.type,
      'x-amz-acl': this.options['x-amz-acl']
    };
    this.client.putFile(file.path, dest, headers, function(err, result) {
      //TODO should dest be a complete s3 url ?
      fn(err, dest);
    });
  };

  return AwsStorage;
})();

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

        storage.save(file, mainFileStorageHandler(file));
      }
    }
    else {
      next();
    }
  }

  function mainFileStorageHandler(file) {
    return function(err, dest) {
      if (err) {
        //TODO handle error
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
