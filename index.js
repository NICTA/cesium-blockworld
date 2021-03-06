var detailFactor = 1.0;
var colourQuantize = 6.0;
var heightScale = 50.0;
var granularityMultiplier = 20;
var subgridCount = 5;
var online = true; // Allow coding when offline

var texCanvas = document.getElementById("tex-canvas");
var texContext = texCanvas.getContext('2d');
var image = new Image();
var imageReady = Cesium.when.defer();
image.src = "textures/earthtex.jpg";
image.onload = function() {
  texContext.drawImage(image, 0, 0);
  imageReady.resolve();
};

var BlockTileProvider = function BlockTileProvider() {
  this._quadtree = undefined;
  this._tilingScheme = new Cesium.GeographicTilingScheme();
  this._errorEvent = new Cesium.Event();
  this._levelZeroMaximumError = Cesium.QuadtreeTileProvider.computeDefaultLevelZeroMaximumGeometricError(this._tilingScheme) * detailFactor;
};

Object.defineProperties(BlockTileProvider.prototype, {
  quadtree : {
    get : function() {
      return this._quadtree;
    },
    set : function(value) {
      this._quadtree = value;
    }
  },

  ready : {
    get : function() {
      return true;
    }
  },

  tilingScheme : {
    get : function() {
      return this._tilingScheme;
    }
  },

  errorEvent : {
    get : function() {
      return this._errorEvent;
    }
  }
});

BlockTileProvider.prototype.beginUpdate = function(context, frameState, commandList) {
};

BlockTileProvider.prototype.endUpdate = function(context, frameState, commandList) {
};

BlockTileProvider.prototype.getLevelMaximumGeometricError = function(level) {
  return this._levelZeroMaximumError / (1 << level);
};

var terrainProvider = new Cesium.CesiumTerrainProvider({
  url : '//cesiumjs.org/smallterrain'
});

function subdivideRect(r, iterations) {
  var x, y;
  var result = [];
  for (y = 0; y < iterations; ++y) {
    var starty = y / iterations;
    var stopy = (y + 1) / iterations;
    var dy = r.north - r.south;
    for (x = 0; x < iterations; ++x) {
      var startx = x / iterations;
      var stopx = (x + 1) / iterations;
      var dx = r.east - r.west;
      result.push({
        west : r.west + startx * dx,
        south : r.south + starty * dy,
        east : r.west + stopx * dx,
        north : r.south + stopy * dy
      });
    }
  }
  return result;
}

function rectDimension(r) {
  var nw = Cesium.Ellipsoid.WGS84.cartographicToCartesian(Cesium.Rectangle.northwest(r));
  var se = Cesium.Ellipsoid.WGS84.cartographicToCartesian(Cesium.Rectangle.southeast(r));
  var dx = nw.x - se.x;
  var dy = nw.y - se.y;
  var dz = nw.z - se.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

BlockTileProvider.prototype.loadTile = function(context, frameState, tile) {
  if (tile.state === Cesium.QuadtreeTileLoadState.START) {

    var rect = JSON.parse(JSON.stringify(tile.rectangle));

    // Avoid poles
    rect.north *= 0.99;
    rect.south *= 0.99;

    var createTileGeo = function(rs, hs, cs) {

      tile.data = {
        primitive : undefined,
        freeResources : function() {
          if (Cesium.defined(this.primitive)) {
            this.primitive.destroy();
            this.sides.destroy();
            this.primitive = undefined;
          }
        }
      };

      // Work out a single tint value: TODO: have these as uniforms
      var quantize = function(v) {
        return Math.floor(v * colourQuantize) / colourQuantize;
      };
      var c = cs[0];
      var tintColour = Cesium.Color.fromBytes(c[0], c[1], c[2], 255);
      var tint = 'vec3(' + quantize(tintColour.red) + ',' + quantize(tintColour.green) + ',' + quantize(tintColour.blue) + ')';

      var vertexFormat = {
        "position" : true,
        "normal" : true,
        "st" : true,
        "binormal" : false,
        "tangent" : false
      };

        var vertexShaderSource = "attribute vec4 color;\nattribute vec3 position3DHigh;\nattribute vec3 position3DLow;\nattribute vec3 normal;\nattribute vec2 st;\nvarying vec4 v_color;\nvarying vec3 v_positionEC;\nvarying vec3 v_normalEC;\nvarying vec2 v_st;\nvoid main()\n{\nv_color = color;\nvec4 p = czm_computePosition();\nv_positionEC = (czm_modelViewRelativeToEye * p).xyz;\nv_normalEC = czm_normal * normal;\nv_st = st;\ngl_Position = czm_modelViewProjectionRelativeToEye * p;\n}\n";
        var fragmentShaderSource = "varying vec4 v_color;\nvarying vec3 v_positionEC;\nvarying vec3 v_normalEC;\nvarying vec2 v_st;\nvoid main()\n{\nvec3 positionToEyeEC = -v_positionEC;\nvec3 normalEC;\n#ifdef FACE_FORWARD\nnormalEC = normalize(faceforward(v_normalEC, vec3(0.0, 0.0, 1.0), -v_normalEC));\n#else\nnormalEC = normalize(v_normalEC);\n#endif\nczm_materialInput materialInput;\nmaterialInput.normalEC = normalEC;\nmaterialInput.positionToEyeEC = positionToEyeEC;\nmaterialInput.st = v_st;\nczm_material material = czm_getMaterial(materialInput);\n#ifdef FLAT\ngl_FragColor = vec4(material.diffuse + material.emission, material.alpha);\n#else\ngl_FragColor = czm_phong(normalize(positionToEyeEC), material) * v_color;\n#endif\n}\n";
        
        var appearance = new Cesium.Appearance({
            "material": new Cesium.Material({
              fabric : {
                type : 'DiffuseMap',
                uniforms : {
                  image : 'textures/top-face.jpg'
                }
              }
            }),
            
            "translucent": true,
            "vertexShaderSource": vertexShaderSource,
            "fragmentShaderSource": fragmentShaderSource,
            "renderState": {
              "depthTest": {
                "enabled": true
              },
              "depthMask": false,
              "blending": {
                "enabled": true,
                "equationRgb": 32774,
                "equationAlpha": 32774,
                "functionSourceRgb": 770,
                "functionSourceAlpha": 770,
                "functionDestinationRgb": 771,
                "functionDestinationAlpha": 771
              }
            },
            "closed": false,
            "materialSupport": {
              "vertexFormat": {
                "position": true,
                "normal": true,
                "st": true,
                "binormal": false,
                "tangent": false
              },
              "vertexShaderSource": vertexShaderSource,
              "fragmentShaderSource": fragmentShaderSource
          },
            "vertexFormat": {
              "position": true,
              "normal": true,
              "st": true,
              "binormal": false,
              "tangent": false
            },
            "flat": false,
            "faceForward": true
          }) ;

      tile.data.primitive = new Cesium.Primitive({
        geometryInstances : rs.map(function(r, i) {
          var c = cs[i];
          var colour = Cesium.Color.fromBytes(c[0], c[1], c[2], 255);
          return new Cesium.GeometryInstance({
            geometry : new Cesium.RectangleGeometry({
              rectangle : r,
              granularity : Cesium.Math.RADIANS_PER_DEGREE * granularityMultiplier,
              height : hs[i],
              vertexFormat : vertexFormat
            }),
            attributes : {
              color : Cesium.ColorGeometryInstanceAttribute.fromColor(colour)
            }
          });
        }),
        appearance : appearance
      });

      tile.data.sides = new Cesium.Primitive({
        geometryInstances : rs.map(function(r, i) {
          var dim = rectDimension(rects[i]) * 0.5;

          return new Cesium.GeometryInstance({
            geometry : Cesium.WallGeometry.fromConstantHeights({
              granularity : Cesium.Math.RADIANS_PER_DEGREE * granularityMultiplier,
              positions : Cesium.Cartesian3.fromRadiansArray([ r.west, r.south, r.west, r.north, r.east, r.north, r.east, r.south, r.west, r.south ]),
              maximumHeight : hs[i],
              minimumHeight : 0.0
            })
          });
        }),
        appearance : new Cesium.MaterialAppearance({
          material : new Cesium.Material({
            fabric : {
              type : 'DiffuseMap',
              uniforms : {
                image : 'textures/dirt-grass.jpg'
              },
              components : {
                diffuse : 'texture2D(image, materialInput.st).rgb  * (vec3(1.0,1.0,1.0) + ' + tint + ') * vec3(0.5,0.5,0.5)'
              }

            }
          })
        })
      });

      tile.data.boundingSphere3D = Cesium.BoundingSphere.fromRectangle3D(rect);
      tile.data.boundingSphere2D = Cesium.BoundingSphere.fromRectangle2D(rect, frameState.mapProjection);
      Cesium.Cartesian3.fromElements(tile.data.boundingSphere2D.center.z, tile.data.boundingSphere2D.center.x, tile.data.boundingSphere2D.center.y,
          tile.data.boundingSphere2D.center);
    };

    var rects = subdivideRect(rect, subgridCount);
    var centroids = rects.map(function(r) {
      return Cesium.Rectangle.center(r);
    });

    var fauxTerrain = function(ps) {
      var dfd = Cesium.when.defer();
      dfd.resolve(ps.map(function(p) {
        return new Cesium.Cartographic(p.longitude, p.latitude, Math.random() * 10000);
      }));
      return dfd.promise;
    };

    // Query the terrain height of two Cartographic positions
    var positions = [ Cesium.Cartographic.fromRadians((rect.west + rect.east) * 0.5, (rect.north + rect.south) * 0.5) ];
    var promise = online ? Cesium.sampleTerrain(terrainProvider, Math.max(0, tile.level - 1), centroids) : fauxTerrain(centroids);

    Cesium.when(imageReady, function() {

      // Sample colours from our image
      var colours = centroids.map(function(c) {
        var nx = c.longitude / Math.PI * 0.5 + 0.5;
        var ny = 1.0 - (c.latitude / Math.PI + 0.5);
        var x = Math.floor(nx * 1024);
        var y = Math.floor(ny * 512);
        return texContext.getImageData(x, y, 1, 1).data;
      });

      Cesium.when(promise, function(updatedPositions) {
        var hs = updatedPositions.map(function(p, i) {
          var dim = rectDimension(rects[i]) * 0.5;
          return Math.floor(Math.max(0.0, p.height) * heightScale / dim) * dim;
        });
        createTileGeo(rects, hs, colours);
      });

    });

    tile.state = Cesium.QuadtreeTileLoadState.LOADING;

  }

  if (tile.state === Cesium.QuadtreeTileLoadState.LOADING) {
    if (Cesium.defined(tile.data) && Cesium.defined(tile.data.primitive)) {
      tile.data.primitive.update(context, frameState, []);
      if (tile.data.primitive.ready) {
        tile.state = Cesium.QuadtreeTileLoadState.DONE;
        tile.renderable = true;
      }
    }
  }
};

BlockTileProvider.prototype.computeTileVisibility = function(tile, frameState, occluders) {
  var boundingSphere;
  if (frameState.mode === Cesium.SceneMode.SCENE3D) {
    boundingSphere = tile.data.boundingSphere3D;
  } else {
    boundingSphere = tile.data.boundingSphere2D;
  }

  return frameState.cullingVolume.computeVisibility(boundingSphere);
};

BlockTileProvider.prototype.showTileThisFrame = function(tile, context, frameState, commandList) {
  if (Cesium.defined(tile.data.primitive)) {
    tile.data.primitive.update(context, frameState, commandList);
  }
  if (Cesium.defined(tile.data.sides)) {
    tile.data.sides.update(context, frameState, commandList);
  }
};

var subtractScratch = new Cesium.Cartesian3();

BlockTileProvider.prototype.computeDistanceToTile = function(tile, frameState) {
  var boundingSphere;

  if (frameState.mode === Cesium.SceneMode.SCENE3D) {
    boundingSphere = tile.data.boundingSphere3D;
  } else {
    boundingSphere = tile.data.boundingSphere2D;
  }

  return Math.max(0.0, Cesium.Cartesian3.magnitude(Cesium.Cartesian3.subtract(boundingSphere.center, frameState.camera.positionWC, subtractScratch)) - boundingSphere.radius);
};

BlockTileProvider.prototype.isDestroyed = function() {
  return false;
};

BlockTileProvider.prototype.destroy = function() {
  return Cesium.destroyObject(this);
};

var viewer = new Cesium.Viewer('cesiumContainer');
var scene = viewer.scene;
var primitives = scene.primitives;

scene._oit.isSupported = function() {
  return false;
};

primitives.add(new Cesium.QuadtreePrimitive({
  tileProvider : new BlockTileProvider()
}));