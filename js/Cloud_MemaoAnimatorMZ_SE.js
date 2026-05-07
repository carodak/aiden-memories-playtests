/*:
 * @target MZ
 * @plugindesc v1.0 Memao SE Addon — Play sound effects on specific frames for each animation type (Idle/Walk/Run/Pickup/Pickaxe/Axe/Plant/Water/Reap)
 * @author CloudTheWolf
 *
 * @help
 * Add Sound Effects To Cloud_MemaoAnimatorMZ. 
 *
 * Tips:
 * - Footsteps Walk/Run: frame "2,5".
 * - Axe/Pickaxe/WaterReap: frame "4".
 * - Plant: frame "2".
 *
 * @param Idle
 * @type struct<ActionSE>
 * @default {"Enabled":"false","SE":"{\"Name\":\"\",\"Volume\":\"75\",\"Pitch\":\"100\",\"Pan\":\"0\"}","Frames":"","OnlyManual":"false"}
 *
 * @param Walk
 * @type struct<ActionSE>
 * @default {"Enabled":"false","SE":"{\"Name\":\"\",\"Volume\":\"75\",\"Pitch\":\"100\",\"Pan\":\"0\"}","Frames":"2,5","OnlyManual":"false"}
 *
 * @param Run
 * @type struct<ActionSE>
 * @default {"Enabled":"false","SE":"{\"Name\":\"\",\"Volume\":\"75\",\"Pitch\":\"100\",\"Pan\":\"0\"}","Frames":"2,5","OnlyManual":"false"}
 *
 * @param Pickup
 * @type struct<ActionSE>
 * @default {"Enabled":"false","SE":"{\"Name\":\"\",\"Volume\":\"75\",\"Pitch\":\"100\",\"Pan\":\"0\"}","Frames":"2","OnlyManual":"true"}
 *
 * @param Pickaxe
 * @type struct<ActionSE>
 * @default {"Enabled":"false","SE":"{\"Name\":\"\",\"Volume\":\"75\",\"Pitch\":\"100\",\"Pan\":\"0\"}","Frames":"2","OnlyManual":"true"}
 *
 * @param Axe
 * @type struct<ActionSE>
 * @default {"Enabled":"true","SE":"{\"Name\":\"\",\"Volume\":\"75\",\"Pitch\":\"100\",\"Pan\":\"0\"}","Frames":"23,"OnlyManual":"true"}
 *
 * @param Plant
 * @type struct<ActionSE>
 * @default {"Enabled":"false","SE":"{\"Name\":\"\",\"Volume\":\"75\",\"Pitch\":\"100\",\"Pan\":\"0\"}","Frames":"2","OnlyManual":"true"}
 *
 * @param Water
 * @type struct<ActionSE>
 * @default {"Enabled":"false","SE":"{\"Name\":\"\",\"Volume\":\"75\",\"Pitch\":\"100\",\"Pan\":\"0\"}","Frames":"2","OnlyManual":"true"}
 *
 * @param Reap
 * @type struct<ActionSE>
 * @default {"Enabled":"false","SE":"{\"Name\":\"\",\"Volume\":\"75\",\"Pitch\":\"100\",\"Pan\":\"0\"}","Frames":"2","OnlyManual":"true"}
 */

/*~struct~SE:
 * @param Name
 * @text File
 * @type file
 * @dir audio/se
 * @default
 * @param Volume
 * @type number
 * @min 0
 * @max 100
 * @default 90
 * @param Pitch
 * @type number
 * @min 50
 * @max 150
 * @default 100
 * @param Pan
 * @type number
 * @min -100
 * @max 100
 * @default 0
 */

/*~struct~ActionSE:
 * @param Enabled
 * @type boolean
 * @default false
 * @param SE
 * @type struct<SE>
 * @default {"Name":"","Volume":"75","Pitch":"100","Pan":"0"}
 * @param Frames
 * @text Trigger Frames (1-based)
 * @type string
 * @default
 * @param OnlyManual
 * @text Only when using PlayAction?
 * @type boolean
 * @default false
 */

(() => {
  "use strict";

  const PLUGIN = "Cloud_MemaoAnimatorMZ_SE";
  const Params = PluginManager.parameters(PLUGIN);

  // ---------- config parsing ----------
  function parseStruct(s, d={}) { if (!s) return d; try { return JSON.parse(s); } catch { return d; } }
  function parseAction(name){
    const raw = parseStruct(Params[name] || "{}");
    const se = parseStruct(raw.SE || "{}");
    const frames = String(raw.Frames || "")
      .split(",").map(t=>t.trim()).filter(Boolean)
      .map(n=>Number(n)).filter(n=>Number.isInteger(n) && n>=1);
    return {
      enabled: String(raw.Enabled||"false")==="true",
      onlyManual: String(raw.OnlyManual||"false")==="true",
      framesSet: new Set(frames),
      se: {
        name: String(se.Name||""),
        volume: Number(se.Volume ?? 90),
        pitch: Number(se.Pitch ?? 100),
        pan: Number(se.Pan ?? 0)
      }
    };
  }

  const CONFIG = {
    idle:           parseAction("Idle"),
    walk:           parseAction("Walk"),
    run:            parseAction("Run"),
    pickup:         parseAction("Pickup"),
    pickaxe:        parseAction("Pickaxe"),
    axe_chop:       parseAction("Axe"),
    axe_strike:     parseAction("Axe"),
    plant:          parseAction("Plant"),
    water:          parseAction("Water"),
    reap:           parseAction("Reap")
  };

  // ---------- helpers ----------
  function actionFromSprite(spr){
    const key = spr._mKey || "";
    const st  = spr._character ? (spr._character._memaoState || {}) : {};
    if (key.startsWith("manual:") || key.startsWith("act:")) {
      const parts = key.split(":");
      return parts[1] || st.action || "";
    }
    if (key.startsWith("walk:")) return "walk";
    if (key.startsWith("run:"))  return "run";
    if (key.startsWith("idle:")) return "idle";
    if (st.mode === "manual") return st.action || "";
    return "";
  }

  function looksLikeMemaoSprite(s){
    // Don’t rely on class; check for fields the animator sets.
    return s && s._character && typeof s.setFrame === "function" &&
           (typeof s._mKey === "string" || typeof s._mFrameIndex === "number" || s._mSeq || s._mPeriod);
  }

  function periodOf(spr){
    // Prefer animator’s ping-pong period if present; otherwise length of seq.
    return (spr._mPeriod || (spr._mSeq ? spr._mSeq.length : 0)) | 0;
  }

  function playSe(se){
    if (!se || !se.name) return;
    AudioManager.playSe({
      name: se.name,
      volume: Number.isFinite(se.volume) ? se.volume : 90,
      pitch:  Number.isFinite(se.pitch)  ? se.pitch  : 100,
      pan:    Number.isFinite(se.pan)    ? se.pan    : 0
    });
  }

  // ---------- scanner (runs every Scene_Map frame) ----------
  const MemaoSE = {
    cache: new WeakMap(), // sprite -> { key, idx, period, fired: Map<action, Set<frame1>> }

    scan(){
      const scene = SceneManager._scene;
      const ss = scene && scene._spriteset;
      const list = ss && ss._characterSprites;
      if (!list || !Array.isArray(list)) return;

      for (const spr of list){
        if (!looksLikeMemaoSprite(spr)) continue;

        const key = spr._mKey || "";
        const idx = (spr._mFrameIndex ?? 0) | 0;
        const per = periodOf(spr);
        if (!per) continue;

        // fetch & init cache
        let c = this.cache.get(spr);
        if (!c) { c = { key, idx, period: per, fired: new Map() }; this.cache.set(spr, c); }

        // detect wrap or state swap
        const wrapped = (key !== c.key) || (idx < c.idx);

        // current action + config
        const act = actionFromSprite(spr);
        const cfg = CONFIG[act];
        if (cfg && cfg.enabled && cfg.se && cfg.se.name) {
          // OnlyManual?
          const st = spr._character?._memaoState || {};
          if (!cfg.onlyManual || st.mode === "manual") {
            // per-action per-cycle dedupe
            let bucket = c.fired.get(act);
            if (!bucket || wrapped) { bucket = new Set(); c.fired.set(act, bucket); }
            const frame1 = (idx % per) + 1; // 1-based frame in this timeline
            if (cfg.framesSet.has(frame1) && !bucket.has(frame1)) {
              bucket.add(frame1);
              playSe(cfg.se);
            }
          }
        }

        // update cache
        c.key = key; c.idx = idx; c.period = per;
      }
    }
  };

  const _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function(){
    _Scene_Map_update.call(this);
    MemaoSE.scan();
  };

})();