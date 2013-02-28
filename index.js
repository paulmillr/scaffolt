'use strict';

var async = require('async');
var fs = require('fs');
var Handlebars = require('handlebars');
var inflection = require('inflection');
var mkdirp = require('mkdirp');
var sysPath = require('path');
var logger = require('loggy');

exports.formatTemplate = function(template, templateData) {
  var compiled, key;
  key = '__BRUNCH_TEMPLATE_FORMATTER';
  compiled = Handlebars.compile(template.replace(/\\\{/, key));
  return compiled(templateData).toString().replace(key, '\\');
};

exports.generateFile = function(path, data, callback) {
  fs.exists(path, function(exists) {
    var parentDir, write;
    if (exists) {
      logger.info("skipping " + path + " (already exists)");
      if (callback != null) {
        return callback();
      }
    } else {
      parentDir = sysPath.dirname(path);
      write = function() {
        logger.info("create " + path);
        fs.writeFile(path, data, callback);
      };
      fs.exists(parentDir, function(exists) {
        if (exists) {
          return write();
        }
        logger.info("init " + parentDir);
        mkdirp(parentDir, 0x1ed, function(error) {
          if (error != null) {
            return logger.error;
          }
          write();
        });
      });
    }
  });
};

exports.destroyFile = function(path, callback) {
  fs.unlink(path, function(error) {
    if (error != null) {
      return logger.error("" + error);
    }
    logger.info("destroy " + path);
    callback(error);
  });
};

exports.scaffoldFile = function(revert, from, to, templateData, parentPath, callback) {
  if (parentPath) {
    to = sysPath.join(parentPath, sysPath.basename(to));
  }
  if (revert) {
    exports.destroyFile(to, callback);
  } else {
    fs.readFile(from, function(error, buffer) {
      var formatted;
      formatted = (function() {
        try {
          return exports.formatTemplate(buffer.toString(), templateData);
        } catch (error) {
          return buffer;
        }
      })();
      exports.generateFile(to, formatted, callback);
    });
  }
};

exports.scaffoldFiles = function(revert, templateData, parentPath) {
  return function(generator, callback) {
    async.forEach(generator.files, function(_arg, next) {
      var from, to;
      from = _arg.from, to = _arg.to;
      exports.scaffoldFile(revert, from, to, templateData, parentPath, next);
    }, callback);
  };
};

exports.isDirectory = function(generatorsPath) {
  return function(path, callback) {
    fs.stat(sysPath.join(generatorsPath, path), function(error, stats) {
      if (error != null) {
        logger.error(error);
      }
      callback(stats.isDirectory());
    });
  };
};

exports.readGeneratorConfig = function(generatorsPath) {
  return function(name, callback) {
    var json, path;
    path = sysPath.resolve(sysPath.join(generatorsPath, name, 'generator.json'));
    json = require(path);
    json.name = name;
    callback(null, json);
  };
};

exports.formatGeneratorConfig = function(path, json, templateData) {
  var join, replaceSlashes;
  join = function(file) {
    return sysPath.join(path, file);
  };
  replaceSlashes = function(string) {
    if (sysPath.sep === '\\') {
      return string.replace(/\//g, '\\');
    } else {
      return string;
    }
  };
  json.files = json.files.map(function(object) {
    return {
      from: join(replaceSlashes(object.from)),
      to: replaceSlashes(exports.formatTemplate(object.to, templateData))
    };
  });
  json.dependencies = json.dependencies.map(function(object) {
    return {
      name: object.name,
      params: exports.formatTemplate(object.params, templateData)
    };
  });
  return Object.freeze(json);
};

exports.getDependencyTree = function(generators, generatorName, memo) {
  var generator, _ref;
  if (memo == null) {
    memo = [];
  }
  generator = generators.filter(function(gen) {
    return gen.name === generatorName;
  })[0];
  if (generator == null) {
    throw new Error("Invalid generator " + generatorName);
  }
  ((_ref = generator.dependencies) != null ? _ref : []).forEach(function(dependency) {
    return exports.getDependencyTree(generators, dependency.name, memo);
  });
  memo.push(generator);
  return memo;
};

exports.generateFiles = function(revert, generatorsPath, type, templateData, parentPath, callback) {
  fs.readdir(generatorsPath, function(error, files) {
    if (error != null) {
      throw new Error(error);
    }
    async.filter(files, exports.isDirectory(generatorsPath), function(directories) {
      async.map(directories, exports.readGeneratorConfig(generatorsPath), function(error, configs) {
        var generators, tree;
        if (error != null) {
          throw new Error(error);
        }
        generators = directories.map(function(directory, index) {
          var path;
          path = sysPath.join(generatorsPath, directory);
          return exports.formatGeneratorConfig(path, configs[index], templateData);
        });
        tree = exports.getDependencyTree(generators, type);
        async.forEach(tree, exports.scaffoldFiles(revert, templateData, parentPath), function(error) {
          if (error != null) {
            return callback(error);
          }
          callback();
        });
      });
    });
  });
};

module.exports = function(type, name, options, callback) {
  if (options == null) options = {};
  if (callback == null) callback = (function() {});

  var pluralName = options.pluralName;
  var generatorsPath = options.generatorsPath;
  var revert = options.revert;
  var parentPath = options.parentPath;
  if (pluralName == null) pluralName = inflection.pluralize(name);
  if (generatorsPath == null) generatorsPath = 'generators';
  if (revert == null) revert = false;

  var templateData = {
    name: name,
    pluralName: pluralName
  };
  exports.generateFiles(revert, generatorsPath, type, templateData, parentPath, function(error) {
    if (error != null) {
      logger.error(error);
      return callback(error);
    }
    callback();
  });
};
