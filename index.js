var detailFactor = 4.0;
var colourQuantize = 6.0;
var heightScale = 20.0;
var granularityMultiplier = 20;
var subgridCount = 2;

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

      tile.data.primitive = new Cesium.Primitive({
        geometryInstances : rs.map(function(r, i) {
          var c = cs[i];
          var color = Cesium.Color.fromBytes(c[0], c[1], c[2], 255);
          return new Cesium.GeometryInstance({
            geometry : new Cesium.RectangleGeometry({
              rectangle : r,
              granularity : Cesium.Math.RADIANS_PER_DEGREE * granularityMultiplier,
              height : hs[i]
            // , vertexFormat : Cesium.PerInstanceColorAppearance.VERTEX_FORMAT
            }),
            attributes : {
              color : Cesium.ColorGeometryInstanceAttribute.fromColor(color)
            }
          });
        }),
        appearance : new Cesium.MaterialAppearance({
          material : new Cesium.Material({
            fabric : {
              type : 'DiffuseMap',
              uniforms : {
                image : 'textures/gravel.png',
                repeat : {
                  x : 1,
                  y : 1
                }
              },
              components : {
                diffuse : 'texture2D(image, materialInput.st * vec2(0.8)).rgb  * ' + tint
              // diffuse : 'vec3(materialInput.st, 0.0)'
              }
            }
          })
        })
      });

      // if (height > 0) {
      if (1) {
        tile.data.sides = new Cesium.Primitive({
          geometryInstances : rs.map(function(r, i) {
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
                  image : 'textures/dirt-grass.png',
                  repeat : {
                    x : 4,
                    y : 1
                  }
                }
              }
            })
          })
        });
      }

      tile.data.boundingSphere3D = Cesium.BoundingSphere.fromRectangle3D(rect);
      tile.data.boundingSphere2D = Cesium.BoundingSphere.fromRectangle2D(rect, frameState.mapProjection);
      Cesium.Cartesian3.fromElements(tile.data.boundingSphere2D.center.z, tile.data.boundingSphere2D.center.x, tile.data.boundingSphere2D.center.y,
          tile.data.boundingSphere2D.center);
    };

    var rects = subdivideRect(rect, subgridCount);
    var centroids = rects.map(function(r) {
      return Cesium.Rectangle.center(r);
    });

    // Query the terrain height of two Cartographic positions
    var positions = [ Cesium.Cartographic.fromRadians((rect.west + rect.east) * 0.5, (rect.north + rect.south) * 0.5) ];
    var promise = Cesium.sampleTerrain(terrainProvider, Math.max(0, tile.level - 1), centroids);

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
        createTileGeo(rects, updatedPositions.map(function(p, i) {
          var dim = rectDimension(rects[i]) * 0.5;
          return Math.floor(Math.max(0.0, p.height) * heightScale / dim) * dim;
        }), colours);
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

  return Math.max(0.0, Cesium.Cartesian3.magnitude(Cesium.Cartesian3.subtract(boundingSphere.center, frameState.camera.positionWC, subtractScratch))
      - boundingSphere.radius);
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