var detailFactor = 4.0;
var colourQuantize = 5.0;
var heightScale = 50.0;
var granularityMultiplier = 20;

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

BlockTileProvider.prototype.loadTile = function(context, frameState, tile) {
  if (tile.state === Cesium.QuadtreeTileLoadState.START) {

    var r = JSON.parse(JSON.stringify(tile.rectangle));

    // Avoid poles
    r.north *= 0.99;
    r.south *= 0.99;

    var clon = (r.east + r.west) * 0.5;
    var clat = (r.north + r.south) * 0.5;
    
    var createTileGeo = function(height, c) {
      tile.data = {
        primitive : undefined,
        freeResources : function() {
          if (Cesium.defined(this.primitive)) {
            this.primitive.destroy();
            this.primitive = undefined;
          }
        }
      };

      var quantize = function(v) {
        return Math.floor(v * colourQuantize) / colourQuantize;
      }
      var color = Cesium.Color.fromBytes(c[0], c[1], c[2], 255);
      var tint = 'vec3(' + quantize(color.red) + ',' + quantize(color.green) + ',' + quantize(color.blue) + ')';

      
      tile.data.primitive = new Cesium.Primitive({
        geometryInstances : new Cesium.GeometryInstance({
          geometry : new Cesium.RectangleGeometry({
            rectangle : r,
            granularity : Cesium.Math.RADIANS_PER_DEGREE * granularityMultiplier,
            height : height
          }),
          attributes : {
            color : Cesium.ColorGeometryInstanceAttribute.fromColor(color)
          }
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
                diffuse : 'texture2D(image, materialInput.st).rgb * ' + tint
              }
            }
          })
        })
      });
      
      //if (height > 0) {
      if(1){
        tile.data.sides = new Cesium.Primitive({
          geometryInstances : new Cesium.GeometryInstance({
            geometry : Cesium.WallGeometry.fromConstantHeights({
              granularity : Cesium.Math.RADIANS_PER_DEGREE * granularityMultiplier,
              positions : Cesium.Cartesian3.fromRadiansArray([ r.west, r.south, r.west, r.north, r.east, r.north, r.east, r.south, r.west, r.south ]),
              maximumHeight : height,
              minimumHeight : 0.0
            }),
            attributes : {
              color : Cesium.ColorGeometryInstanceAttribute.fromColor(color)
            }
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

      // tile.data.primitive.material = Cesium.Material.fromType('Checkerboard');

      tile.data.boundingSphere3D = Cesium.BoundingSphere.fromRectangle3D(r);
      tile.data.boundingSphere2D = Cesium.BoundingSphere.fromRectangle2D(r, frameState.mapProjection);
      Cesium.Cartesian3.fromElements(tile.data.boundingSphere2D.center.z, tile.data.boundingSphere2D.center.x, tile.data.boundingSphere2D.center.y,
          tile.data.boundingSphere2D.center);

    }

    function getFauxTerrain(positions) {
      var result = Cesium.when.defer();
      result.resolve(positions.map(function(p) {
        return {
          height : Math.random() * 10000
        };
      }));
      return result;
    }

    // Query the terrain height of two Cartographic positions
    var positions = [ Cesium.Cartographic.fromRadians((r.west + r.east) * 0.5, (r.north + r.south) * 0.5) ];
    var promise = Cesium.sampleTerrain(terrainProvider, Math.max(0, tile.level - 1), positions);
    //var promise = getFauxTerrain(positions);

    Cesium.when(imageReady, function() {
      var nx = clon / Math.PI * 0.5 + 0.5;
      var ny = 1.0 - (clat / Math.PI + 0.5);
      var x = Math.floor(nx * 1024);
      var y = Math.floor(ny * 512);
      var c = texContext.getImageData(x, y, 1, 1).data;

      Cesium.when(promise, function(updatedPositions) {
        var height = updatedPositions[0].height;
        height = height * heightScale;
        createTileGeo(height, c);
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