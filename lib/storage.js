var fs = require('fs'),
    path = require('path'),
    knox = require('knox');

function generateNameWithExt(file) {
  var name = '';
  for (var i = 0; i < 32; i++) {
    name += Math.floor(Math.random() * 16).toString(16);
  }
  name += path.extname(file);

  return name;
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

exports.AwsStorage = AwsStorage;
exports.FileSystemStorage = FileSystemStorage;
