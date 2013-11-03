var fs = require('fs'),
    path = require('path'),
    knox = require('knox'),
    crypto = require('crypto');

function generateNameWithExt(file, cb) {
  // Short-circuit if a custom filename has been set
  if(file.dest) { return cb(null, file.dest); }

  var name = '',
      shasum = crypto.createHash('sha1');

  var stream = fs.createReadStream(file.path);
  stream.on('data', function(d) {
    shasum.update(d);
  });

  stream.on('end', function(err) {
    name = shasum.digest('hex');
    name += path.extname(file.name);
    return cb(err, name);
  });
}

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
  var that = this;
  generateNameWithExt(file, function(err, name) {
    if(err) { return fn(err); }
    var dest = path.join(that.uploadPath, name);

    var headers =  {
      'Content-Type': file.type,
      'x-amz-acl': that.options['x-amz-acl']
    };

    var errorHandlerCalled = false;
    // errorHandler can be more than twice due to a double-error bug
    // https://github.com/LearnBoost/knox/issues/1#issuecomment-21907842
    var errorHandler = function(err) {
      if (!errorHandlerCalled) {
        errorHandlerCalled = true;
        if(err) {
          fn(err);
        }
        else {
          //TODO should dest be a complete s3 url ?
          fn(null, dest);
        }
      }
    };

    var req = this.client.putFile(file.path, dest, headers, errorHandler);
    req.on('error', errorHandler);
  });
};

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
  var that = this;
  generateNameWithExt(file, function(err, name) {
    if(err) { return fn(err); }
    var dest = path.join(that.uploadPath, path.basename(name));

    fs.exists(dest, function(exists) {
      if(exists) {
        fn(null, dest);
      } else {
        srcStream = fs.createReadStream(file.path);
        destStream = fs.createWriteStream(dest);
        srcStream.on('end', function(err) {
          fn(err, dest);
        });
        srcStream.pipe(destStream);
      }
    });

  });
};

exports.AwsStorage = AwsStorage;
exports.FileSystemStorage = FileSystemStorage;
