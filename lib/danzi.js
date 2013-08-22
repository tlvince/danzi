module.exports = function(options) {
  return function(req, res, next) {
    console.log("Running into DanZi");
    next();
  };
};
