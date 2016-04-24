var _ = require('lodash');
var P = require('bluebird');
var npm = require('npm');
var RegClient = require('npm-registry-client');

// map-to-registry contains logic for figuring out the correct 
// registry uri and auth to use for a given package name, based on things
// like the package's scope and the npm config loaded from .npmrc, etc.
// Unfortunately this module is embedded in the guts of the npm module, 
// so we have to reach in to grab it.
var mapToRegistry = require("npm/lib/utils/map-to-registry");
mapToRegistry = P.promisify(mapToRegistry);

function lookupUriAndAuth(npmConfig,packageName) {
  return new P(function (resolve, reject) {
    mapToRegistry(packageName, npmConfig, function cb(er,uri,auth) {
      if (er) return reject(er);
      resolve([uri,auth]);
    });
  });
}


module.exports = function createNpmClient(npmConfig) {
  var registry = new RegClient(npmConfig);

  var clientGet = P.promisify(registry.get, {context:registry});

  function existingVersionsFor(packageName){
    return lookupUriAndAuth(npmConfig,packageName).spread( function (uri,auth){
      return clientGet(uri, {auth:auth});
    }).then(function (data) {
      return _.keys(data.versions);
    }).catch(function (err) {
      if( err.statusCode === 404 ) {
        return P.reject('could not find the module: '+packageName);
      }
      return P.reject(err);
    });
  }

  function publish(packageDir){
    // pretty gross to be using `npm` directly, since it is a huge sprawling globalton
    // with its own config which doesn't necessarily line up with 
    // the `npmConfig` we were passed at construction time. Unfortunately most of its
    // higher-level publish functionality is baked into that globalton. :(
    return P.promisify(npm.commands.publish)( [packageDir] );
  }

  return {
    existingVersionsFor: existingVersionsFor,
    publish: publish
  };
};
