var assert = require('assert'),
  fs = require('fs'),
  request = require('supertest'),
  express = require('express');

var danzi = require('..');

var uploadPath = __dirname + '/upload';

var app = express();

app
  .use(express.bodyParser())
  .use(danzi({ path: uploadPath }))
  .use(function(req, res) {
    if (req.files && req.files.hasOwnProperty('file')) {
      res.send(req.files.file.uri);
    }
    else {
      res.json(req.body);
    }
  });

describe('post request test', function() {
  it('should response to request param', function(done) {
    var param = { name: "test" };
    request(app)
      .post('/')
      .send(param)
      .expect('Content-Type', /json/)
      .expect(200)
      .expect(param, done);
  });

  it('should parse x-www-form-urlencoded', function(done){
    request(app)
      .post('/')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('user=alice')
      .expect({user: "alice"}, done);
  });

  describe('with multipart/form-data', function() {
    it('should populate req.body', function(done) {
      var req = request(app);
      req
        .post('/')
        .field('user', 'Alice')
        .expect({user: "Alice"}, done);
    });
  });
});

describe('upload a file', function() {
  it('should has uploaded file', function(done) {
    request(app)
      .post('/')
      .attach('file', __dirname + '/fixture.txt')
      .expect(200)
      .end(function(err, res) {
        fs.exists(res.text, function(exists) {
          assert.equal(exists, true);
          done();
        });
      });
  });

  it('should use the files SHA1 as its filename', function(done) {
    var sha1 = '2b720d3ce73c125361b07f3d59879f395711b5cb';
    request(app)
      .post('/')
      .attach('file', __dirname + '/fixture.txt')
      .expect(200)
      .end(function(err, res) {
        assert.equal(res.text, __dirname + '/upload/' + sha1 + '.txt');
        done();
      });
  });

  after(function(done) {
    var files = fs.readdirSync(uploadPath);
    for(var key in files) {
      fs.unlinkSync(uploadPath + '/' + files[key]);
    }
    fs.rmdirSync(uploadPath);
    done();
  });

});
