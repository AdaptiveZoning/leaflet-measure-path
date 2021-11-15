function angle(cx, cy, ex, ey){
    dy = ey - cy;
    dx = ex - cx;
    theta = Math.atan2(dy, dx);
    theta *= 180 / Math.PI;
    return theta;
}

!(function() {
    'use strict';

    L.Marker.Measurement = L[L.Layer ? 'Layer' : 'Class'].extend({
        options: {
            pane: 'markerPane'
        },

        initialize: function(latlng, measurement, title, rotation, options) {
            L.setOptions(this, options);

            this._latlng = latlng;
            this._measurement = measurement;
            this._title = title;
            this._rotation = rotation;
        },

        addTo: function(map) {
            map.addLayer(this);
            return this;
        },

        onAdd: function(map) {
            this._map = map;
            var pane = this.getPane ? this.getPane() : map.getPanes().markerPane;
            var el = this._element = L.DomUtil.create('div', 'leaflet-zoom-animated leaflet-measure-path-measurement', pane);
            var inner = L.DomUtil.create('div', '', el);
            inner.title = this._title;
            inner.innerHTML = this._measurement;

            map.on('zoomanim', this._animateZoom, this);

            this._setPosition();
        },

        onRemove: function(map) {
            map.off('zoomanim', this._animateZoom, this);
            var pane = this.getPane ? this.getPane() : map.getPanes().markerPane;
            pane.removeChild(this._element);
            this._map = null;
        },

        _setPosition: function() {
            L.DomUtil.setPosition(this._element, this._map.latLngToLayerPoint(this._latlng));
            this._element.style.transform += ' rotate(' + this._rotation + 'rad)';
        },

        _animateZoom: function(opt) {
            var pos = this._map._latLngToNewLayerPoint(this._latlng, opt.zoom, opt.center).round();
            L.DomUtil.setPosition(this._element, pos);
            this._element.style.transform += ' rotate(' + this._rotation + 'rad)';
        }
    });

    L.marker.measurement = function(latLng, measurement, title, rotation, options) {
        return new L.Marker.Measurement(latLng, measurement, title, rotation, options);
    };

    var formatDistance = function(d) {
        var unit,
            feet;

        if (this._measurementOptions.imperial) {
            feet = d / 0.3048;
            if (feet > 3000) {
                d = d / 1609.344;
                unit = 'mi';
            } else {
                d = feet;
                unit = 'ft';
            }
        } else {
            if (d > 1000) {
                d = d / 1000;
                unit = 'km';
            } else {
                unit = 'm';
            }
        }

        if (d < 100) {
            return d.toFixed(1) + ' ' + unit;
        } else {
            return Math.round(d) + ' ' + unit;
        }
    }

    var formatArea = function(a) {
        var unit,
            sqfeet;

        if (this._measurementOptions.imperial) {
            a = a / 0.09290304;
            unit = 'ft²';
        } else if (this._measurementOptions.ha) {
            if (a > 1000000000) {
                a = a / 1000000000;
                unit = 'km²';
            } else if (a > 10000) {
                a = a / 10000;
                unit = 'ha';
            } else {
                unit = 'm²';
            }
        } else {
            if (a > 1000000) {
                a = a / 1000000;
                unit = 'km²';
            } else {
                unit = 'm²';
            }
        }

        if (a < 100) {
            return a.toFixed(1) + ' ' + unit;
        } else {
            return (Math.round(a) + ' ' + unit).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        }
    }

    var RADIUS = 6378137;
    // ringArea function copied from geojson-area
    // (https://github.com/mapbox/geojson-area)
    // This function is distributed under a separate license,
    // see LICENSE.md.
    var ringArea = function ringArea(coords) {
        var rad = function rad(_) {
            return _ * Math.PI / 180;
        };
        var p1, p2, p3, lowerIndex, middleIndex, upperIndex,
        area = 0,
        coordsLength = coords.length;

        if (coordsLength > 2) {
            for (var i = 0; i < coordsLength; i++) {
                if (i === coordsLength - 2) {// i = N-2
                    lowerIndex = coordsLength - 2;
                    middleIndex = coordsLength -1;
                    upperIndex = 0;
                } else if (i === coordsLength - 1) {// i = N-1
                    lowerIndex = coordsLength - 1;
                    middleIndex = 0;
                    upperIndex = 1;
                } else { // i = 0 to N-3
                    lowerIndex = i;
                    middleIndex = i+1;
                    upperIndex = i+2;
                }
                p1 = coords[lowerIndex];
                p2 = coords[middleIndex];
                p3 = coords[upperIndex];
                area += ( rad(p3.lng) - rad(p1.lng) ) * Math.sin( rad(p2.lat));
            }

            area = area * RADIUS * RADIUS / 2;
        }

        return Math.abs(area);
    };
    /**
     * Handles the init hook for polylines and circles.
     * Implements the showOnHover functionality if called for.
     */
    var addInitHook = function() {
        var showOnHover = this.options.measurementOptions && this.options.measurementOptions.showOnHover;
        if (this.options.showMeasurements && !showOnHover) {
            this.showMeasurements();
        }
        if (this.options.showMeasurements && showOnHover) {
            this.on('mouseover', function() {
                this.showMeasurements();
            });
            this.on('mouseout', function() {
                this.hideMeasurements();
            });
        }
    };

    var circleArea = function circleArea(d) {
        var rho = d / RADIUS;
        return 2 * Math.PI * RADIUS * RADIUS * (1 - Math.cos(rho));
    };

    var override = function(method, fn, hookAfter) {
        if (!hookAfter) {
            return function() {
                var originalReturnValue = method.apply(this, arguments);
                var args = Array.prototype.slice.call(arguments)
                args.push(originalReturnValue);
                return fn.apply(this, args);
            }
        } else {
            return function() {
                fn.apply(this, arguments);
                return method.apply(this, arguments);
            }
        }
    };

    L.Polyline.include({
        showMeasurements: function(options) {
            if (!this._map || this._measurementLayer) return this;

            this._measurementOptions = L.extend({
                showOnHover: (options && options.showOnHover) || false,
                minPixelDistance: 30,
                showDistances: true,
                showArea: true,
                showTotalDistance: true,
                lang: {
                    totalLength: 'Total length',
                    totalArea: 'Total area',
                    radius: 'Radius',
                    diameter: 'Diameter',
                    segmentLength: 'Segment length'
                }
            }, options || {});

            this._measurementLayer = L.layerGroup().addTo(this._map);
            this.updateMeasurements();

            this._map.on('zoomend', this.updateMeasurements, this);

            return this;
        },

        hideMeasurements: function() {
            if (!this._map) return this;

            this._map.off('zoomend', this.updateMeasurements, this);

            if (!this._measurementLayer) return this;
            this._map.removeLayer(this._measurementLayer);
            this._measurementLayer = null;

            return this;
        },

        onAdd: override(L.Polyline.prototype.onAdd, function(originalReturnValue) {
            var showOnHover = this.options.measurementOptions && this.options.measurementOptions.showOnHover;
            if (this.options.showMeasurements && !showOnHover) {
                this.showMeasurements(this.options.measurementOptions);
            }

            return originalReturnValue;
        }),

        onRemove: override(L.Polyline.prototype.onRemove, function(originalReturnValue) {
            this.hideMeasurements();

            return originalReturnValue;
        }, true),

        setLatLngs: override(L.Polyline.prototype.setLatLngs, function(originalReturnValue) {
            this.updateMeasurements();

            return originalReturnValue;
        }),

        spliceLatLngs: override(L.Polyline.prototype.spliceLatLngs, function(originalReturnValue) {
            this.updateMeasurements();

            return originalReturnValue;
        }),

        formatDistance: formatDistance,
        formatArea: formatArea,

        updateMeasurements: function() {
            if (!this._measurementLayer) return this;

            var latLngs = this.getLatLngs(),
                isPolygon = this instanceof L.Polygon,
                options = this._measurementOptions,
                totalDist = 0,
                formatter,
                ll1,
                ll2,
                p1,
                p2,
                pixelDist,
                dist,
                lineDist = 0,
                linePixelDist = 0;

            if (latLngs && latLngs.length && L.Util.isArray(latLngs[0])) {
                // Outer ring is stored as an array in the first element,
                // use that instead.
                latLngs = latLngs[0];
            }

            this._measurementLayer.clearLayers();

            if (this._measurementOptions.showDistances && latLngs.length > 1) {
                formatter = this._measurementOptions.formatDistance || L.bind(this.formatDistance, this);

                var distances = [];
                var indexes = [];

                var started = false;

                // compute the angle of each line
                var angles = [];
                for (var i = 1, len = latLngs.length; i <= len; i++){
                    ll1 = latLngs[(i - 1) % len];
                    ll2 = latLngs[i % len];
                    p1 = this._map.latLngToLayerPoint(ll1);
                    p2 = this._map.latLngToLayerPoint(ll2);
                    angles.push(angle(ll1.lng, ll1.lat, ll2.lng, ll2.lat));
                }

                // figure out where new lines start based on their change in angle
                var line_starts = [];
                var last_angle = angles[angles.length - 1];
                for (var i = 0, len = angles.length; i < len; i++){
                    if (Math.abs(last_angle - angles[i]) > 10){
                        line_starts.push(1);
                    } else{
                        line_starts.push(0);
                    }

                    last_angle = angles[i];
                }

                for (var i = 1, len = latLngs.length; (isPolygon && i <= len) || (i < len || (lineDist > 0 && i < (len*2))); i++) {
                    var line_number = i - 1;
                    if (line_starts[(line_number) % line_starts.length] == 1){
                        started = true;
                    }

                    if (started) {
                        ll1 = latLngs[(i - 1) % len];
                        ll2 = latLngs[i % len];
                        dist = ll1.distanceTo(ll2);
                        totalDist += dist;

                        p1 = this._map.latLngToLayerPoint(ll1);
                        p2 = this._map.latLngToLayerPoint(ll2);

                        pixelDist = p1.distanceTo(p2);

                        if (line_starts[(line_number + 1) % line_starts.length] == 1) { //if the next line is the start of a line, stop counting
                            dist += lineDist;

                            for(var j = 0; j < distances.length; j++){
                                if (distances[j] > (dist / 2)){
                                    ll1 = latLngs[(indexes[j] - 1) % len];
                                    ll2 = latLngs[(indexes[j]) % len];
                                    p1 = this._map.latLngToLayerPoint(ll1);
                                    p2 = this._map.latLngToLayerPoint(ll2);

                                    break;
                                }
                            }

                            if (pixelDist + linePixelDist >= options.minPixelDistance) {
                                L.marker.measurement(
                                    this._map.layerPointToLatLng([(p1.x + p2.x) / 2, (p1.y + p2.y) / 2]),
                                    formatter(dist), options.lang.segmentLength, this._getRotation(ll1, ll2), options)
                                    .addTo(this._measurementLayer);
                            }

                            lineDist = 0;
                            linePixelDist = 0;
                            distances = [];
                            indexes = [];
                        } else{
                            lineDist += dist;
                            linePixelDist += pixelDist;
                            distances.push(lineDist);
                            indexes.push(i);
                        }
                    }
                }

                // Show total length for polylines
                if (!isPolygon && this._measurementOptions.showTotalDistance) {
                    L.marker.measurement(ll2, formatter(totalDist), options.lang.totalLength, 0, options)
                        .addTo(this._measurementLayer);
                }
            }

            if (isPolygon && options.showArea && latLngs.length > 2) {
                formatter = options.formatArea || L.bind(this.formatArea, this);
                var area = ringArea(latLngs);
                L.marker.measurement(this.getBounds().getCenter(),
                    formatter(area), options.lang.totalArea, 0, options)
                    .addTo(this._measurementLayer);
            }

            return this;
        },

        _getRotation: function(ll1, ll2) {
            var p1 = this._map.project(ll1),
                p2 = this._map.project(ll2);

            return Math.atan((p2.y - p1.y) / (p2.x - p1.x));
        }
    });

    L.Polyline.addInitHook(function() {
        addInitHook.call(this);
    });

    L.Circle.include({
        showMeasurements: function(options) {
            if (!this._map || this._measurementLayer) return this;

            this._measurementOptions = L.extend({
                showOnHover: false,
                showArea: true,
                lang: {
                    totalArea: 'Total area',
                }
            }, options || {});

            this._measurementLayer = L.layerGroup().addTo(this._map);
            this.updateMeasurements();

            this._map.on('zoomend', this.updateMeasurements, this);

            return this;
        },

        hideMeasurements: function() {
            if (!this._map) return this;

            this._map.on('zoomend', this.updateMeasurements, this);

            if (!this._measurementLayer) return this;
            this._map.removeLayer(this._measurementLayer);
            this._measurementLayer = null;

            return this;
        },

        onAdd: override(L.Circle.prototype.onAdd, function(originalReturnValue) {
            var showOnHover = this.options.measurementOptions && this.options.measurementOptions.showOnHover;
            if (this.options.showMeasurements && !showOnHover) {
                this.showMeasurements(this.options.measurementOptions);
            }

            return originalReturnValue;
        }),

        onRemove: override(L.Circle.prototype.onRemove, function(originalReturnValue) {
            this.hideMeasurements();

            return originalReturnValue;
        }, true),

        setLatLng: override(L.Circle.prototype.setLatLng, function(originalReturnValue) {
            this.updateMeasurements();

            return originalReturnValue;
        }),

        setRadius: override(L.Circle.prototype.setRadius, function(originalReturnValue) {
            this.updateMeasurements();

            return originalReturnValue;
        }),

        formatDistance: formatDistance,

        updateMeasurements: function() {
            if (!this._measurementLayer) return;

            var latLng = this.getLatLng(),
                options = this._measurementOptions,
                formatter = options.formatDistance || L.bind(this.formatDistance, this);

            this._measurementLayer.clearLayers();

            if (options.showArea) {
                formatter = options.formatDistance || L.bind(this.formatDistance, this);
                var radius = this.getRadius();
                L.marker.measurement(latLng,
                    formatter(2*radius), options.lang.diameter, 0, options)
                    .addTo(this._measurementLayer);
            }
        }
    })

    L.Circle.addInitHook(function() {
        addInitHook.call(this);
    });
})();
