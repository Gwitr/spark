"use strict";

class RemoteXML {
    constructor(path, options={}) {
        this.path = path;
        this.loaded = false;
        this.onload = options["onload"] || (() => null);
        this.basepath = options["basepath"] || (typeof this.path === "string" || this.path instanceof String ? this.path.split("/").slice(0, -1).join("/") : "/");
        if (this.basepath !== "/" && !options["basepath"])
            this.path = this.path.split("/").slice(-1)[0];
        this.parent = options["parent"] || null;
        this.old_attrib = [];
    }

    load() {
        var onresponse = xml => {
            this.xml = xml.attributes ? xml : xml.children[0];
            if (this.xml.attributes.source) {
                this.path = this.xml.attributes.source.value;
                this.old_attrib = [...this.old_attrib, ...this.xml.attributes];
                this.old_attrib.splice(this.old_attrib.findIndex(x => x.name === "source"), 1);
                this.load();
            } else {
                this.loaded = true;
                for (let attrib of this.old_attrib)
                    this.xml.setAttribute(attrib.name, attrib.value);
                this.old_attrib = null;
                this._onload();
            }
        };
        if (typeof this.path === "string" || this.path instanceof String) {
            let path = this.path[0] == "/" ? this.path : this.basepath + "/" + this.path;
            fetch(path).then(response => {
                if (!response.ok)
                    throw `server returned ${response.status} ${response.statusText}`;
                return response.text();
            }).then(text =>
                onresponse((new DOMParser()).parseFromString(text, "application/xml"))
            );
        } else onresponse(this.path);
        return this;
    }

    _load_child_tags(name, cls) {
        return new Promise((resolve, _reject) => {
            let loadCount = 0;
            let arr = [...this.xml.querySelectorAll(`:scope > ${name}`)].map(x => new cls(x, {
                onload: () => { if (++loadCount == arr.length) resolve(arr); },
                basepath: this.basepath,
                parent: this
            }));
            arr.map(x => x.load());
            if (arr.length === 0)
                resolve(arr);
        });
    }

    _onload() { throw "base _onload"; }
}

class Tile {
    constructor(tileset, gid) {
        this.tileset = tileset;
        this.gid = gid;
    }

    get id() {
        return this.gid - this.tileset.firstgid;
    }
}

class TMXBaseLayer {
    constructor(map, xml) {
        this.map = map;
        this.name = xml.attributes.name.value || "";
    }
}

class TMXTileLayer extends TMXBaseLayer {
    constructor(map, xml) {
        super(map, xml);
        let csv = xml.getElementsByTagName("data")[0].textContent;
        this.data = csv.replaceAll("\n", ",").split(",").map(x => +x.trim());
        this.width = +xml.attributes.width.value;
        this.height = +xml.attributes.height.value;
    }

    get(x, y) {
        return this.map.findTile(this.data[this.width * y + x]);
    }

    set(x, y, v) {
        if (v instanceof Tile) {
            this.data[this.width * y + x] = v.gid;
        } else {
            this.data[this.width * y + x] = v;
        }
    }
}

class TSX extends RemoteXML {
    _onload() {
        this.firstgid = +this.xml.attributes.firstgid.value;
        this.tilecount = +this.xml.attributes.tilecount.value;
        this.onload();
    }
}

class TMXLayerContainer extends RemoteXML {
    _onload() {
        this.layer = new TMXTileLayer(this.parent, this.xml);
        this.onload();
    }
}

class TMX extends RemoteXML {
    _onload() {
        // Extraordinarily lazy
        this._load_child_tags("tileset", TSX).then(tilesets => {
            this.tilesets = tilesets;
            return this._load_child_tags("layer", TMXLayerContainer);
        }).then(layers => {
            this.layers = layers;
            this.onload();
        });
    }

    findTile(gid) {
        for (let tileset of this.tilesets) {
            if (tileset.firstgid <= gid && gid < tileset.firstgid + tileset.tilecount) {
                return new Tile(tileset, gid);
            }
        }
        return null;
    }
}

var tmx;
function main() {
    var canvas = document.getElementById("canvas");
    var ctx = canvas.getContext("2d");

    tmx = new TMX("spark/test.tmx");
    tmx.onload = () => { console.log("loaded"); };
    tmx.load();

    ctx.fillStyle = "blue";
    ctx.fillRect(130, 190, 40, 60);
}
