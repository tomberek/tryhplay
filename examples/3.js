// This object will hold all exports.
var Haste = {};

/* Thunk
   Creates a thunk representing the given closure.
   Since we want automatic memoization of as many expressions as possible, we
   use a JS object as a sort of tagged pointer, where the member x denotes the
   object actually pointed to. If a "pointer" points to a thunk, it has a
   member 't' which is set to true; if it points to a value, be it a function,
   a value of an algebraic type of a primitive value, it has no member 't'.
*/

function T(f) {
    this.f = new F(f);
}

function F(f) {
    this.f = f;
}

/* Apply
   Applies the function f to the arguments args. If the application is under-
   saturated, a closure is returned, awaiting further arguments. If it is over-
   saturated, the function is fully applied, and the result (assumed to be a
   function) is then applied to the remaining arguments.
*/
function A(f, args) {
    if(f instanceof T) {
        f = E(f);
    }
    // Closure does some funny stuff with functions that occasionally
    // results in non-functions getting applied, so we have to deal with
    // it.
    if(!(f instanceof Function)) {
        return f;
    }

    if(f.arity === undefined) {
        f.arity = f.length;
    }
    if(args.length === f.arity) {
        switch(f.arity) {
            case 0:  return f();
            case 1:  return f(args[0]);
            default: return f.apply(null, args);
        }
    } else if(args.length > f.arity) {
        switch(f.arity) {
            case 0:  return f();
            case 1:  return A(f(args.shift()), args);
            default: return A(f.apply(null, args.splice(0, f.arity)), args);
        }
    } else {
        var g = function() {
            return A(f, args.concat(Array.prototype.slice.call(arguments)));
        };
        g.arity = f.arity - args.length;
        return g;
    }
}

/* Eval
   Evaluate the given thunk t into head normal form.
   If the "thunk" we get isn't actually a thunk, just return it.
*/
function E(t) {
    if(t instanceof T) {
        if(t.f instanceof F) {
            return t.f = t.f.f();
        } else {
            return t.f;
        }
    } else {
        return t;
    }
}

// Export Haste, A and E. Haste because we need to preserve exports, A and E
// because they're handy for Haste.Foreign.
if(!window) {
    var window = {};
}
window['Haste'] = Haste;
window['A'] = A;
window['E'] = E;


/* Throw an error.
   We need to be able to use throw as an exception so we wrap it in a function.
*/
function die(err) {
    throw err;
}

function quot(a, b) {
    return (a-a%b)/b;
}

function quotRemI(a, b) {
    return [0, (a-a%b)/b, a%b];
}

// 32 bit integer multiplication, with correct overflow behavior
// note that |0 or >>>0 needs to be applied to the result, for int and word
// respectively.
function imul(a, b) {
  // ignore high a * high a as the result will always be truncated
  var lows = (a & 0xffff) * (b & 0xffff); // low a * low b
  var aB = (a & 0xffff) * (b & 0xffff0000); // low a * high b
  var bA = (a & 0xffff0000) * (b & 0xffff); // low b * high a
  return lows + aB + bA; // sum will not exceed 52 bits, so it's safe
}

function addC(a, b) {
    var x = a+b;
    return [0, x & 0xffffffff, x > 0x7fffffff];
}

function subC(a, b) {
    var x = a-b;
    return [0, x & 0xffffffff, x < -2147483648];
}

function sinh (arg) {
    return (Math.exp(arg) - Math.exp(-arg)) / 2;
}

function tanh (arg) {
    return (Math.exp(arg) - Math.exp(-arg)) / (Math.exp(arg) + Math.exp(-arg));
}

function cosh (arg) {
    return (Math.exp(arg) + Math.exp(-arg)) / 2;
}

// Scratch space for byte arrays.
var rts_scratchBuf = new ArrayBuffer(8);
var rts_scratchW32 = new Uint32Array(rts_scratchBuf);
var rts_scratchFloat = new Float32Array(rts_scratchBuf);
var rts_scratchDouble = new Float64Array(rts_scratchBuf);

function decodeFloat(x) {
    rts_scratchFloat[0] = x;
    var sign = x < 0 ? -1 : 1;
    var exp = ((rts_scratchW32[0] >> 23) & 0xff) - 150;
    var man = rts_scratchW32[0] & 0x7fffff;
    if(exp === 0) {
        ++exp;
    } else {
        man |= (1 << 23);
    }
    return [0, sign*man, exp];
}

function decodeDouble(x) {
    rts_scratchDouble[0] = x;
    var sign = x < 0 ? -1 : 1;
    var manHigh = rts_scratchW32[1] & 0xfffff;
    var manLow = rts_scratchW32[0];
    var exp = ((rts_scratchW32[1] >> 20) & 0x7ff) - 1075;
    if(exp === 0) {
        ++exp;
    } else {
        manHigh |= (1 << 20);
    }
    return [0, sign, manHigh, manLow, exp];
}

function isFloatFinite(x) {
    return isFinite(x);
}

function isDoubleFinite(x) {
    return isFinite(x);
}

function err(str) {
    die(toJSStr(str));
}

/* unpackCString#
   NOTE: update constructor tags if the code generator starts munging them.
*/
function unCStr(str) {return unAppCStr(str, [0]);}

function unFoldrCStr(str, f, z) {
    var acc = z;
    for(var i = str.length-1; i >= 0; --i) {
        acc = A(f, [[0, str.charCodeAt(i)], acc]);
    }
    return acc;
}

function unAppCStr(str, chrs) {
    var i = arguments[2] ? arguments[2] : 0;
    if(i >= str.length) {
        return E(chrs);
    } else {
        return [1,[0,str.charCodeAt(i)],new T(function() {
            return unAppCStr(str,chrs,i+1);
        })];
    }
}

function charCodeAt(str, i) {return str.charCodeAt(i);}

function fromJSStr(str) {
    return unCStr(E(str));
}

function toJSStr(hsstr) {
    var s = '';
    for(var str = E(hsstr); str[0] == 1; str = E(str[2])) {
        s += String.fromCharCode(E(str[1])[1]);
    }
    return s;
}

// newMutVar
function nMV(val) {
    return ({x: val});
}

// readMutVar
function rMV(mv) {
    return mv.x;
}

// writeMutVar
function wMV(mv, val) {
    mv.x = val;
}

// atomicModifyMutVar
function mMV(mv, f) {
    var x = A(f, [mv.x]);
    mv.x = x[1];
    return x[2];
}

function localeEncoding() {
    var le = newByteArr(5);
    le['b']['i8'] = 'U'.charCodeAt(0);
    le['b']['i8'] = 'T'.charCodeAt(0);
    le['b']['i8'] = 'F'.charCodeAt(0);
    le['b']['i8'] = '-'.charCodeAt(0);
    le['b']['i8'] = '8'.charCodeAt(0);
    return le;
}

var isDoubleNaN = isNaN;
var isFloatNaN = isNaN;

function isDoubleInfinite(d) {
    return (d === Infinity);
}
var isFloatInfinite = isDoubleInfinite;

function isDoubleNegativeZero(x) {
    return (x===0 && (1/x)===-Infinity);
}
var isFloatNegativeZero = isDoubleNegativeZero;

function strEq(a, b) {
    return a == b;
}

function strOrd(a, b) {
    if(a < b) {
        return [0];
    } else if(a == b) {
        return [1];
    }
    return [2];
}

function jsCatch(act, handler) {
    try {
        return A(act,[0]);
    } catch(e) {
        return A(handler,[e, 0]);
    }
}

var coercionToken = undefined;

/* Haste represents constructors internally using 1 for the first constructor,
   2 for the second, etc.
   However, dataToTag should use 0, 1, 2, etc. Also, booleans might be unboxed.
 */
function dataToTag(x) {
    if(x instanceof Array) {
        return x[0];
    } else {
        return x;
    }
}

function __word_encodeDouble(d, e) {
    return d * Math.pow(2,e);
}

var __word_encodeFloat = __word_encodeDouble;
var jsRound = Math.round; // Stupid GHC doesn't like periods in FFI IDs...
var realWorld = undefined;
if(typeof _ == 'undefined') {
    var _ = undefined;
}

function popCnt(i) {
    i = i - ((i >> 1) & 0x55555555);
    i = (i & 0x33333333) + ((i >> 2) & 0x33333333);
    return (((i + (i >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

function jsAlert(val) {
    if(typeof alert != 'undefined') {
        alert(val);
    } else {
        print(val);
    }
}

function jsLog(val) {
    console.log(val);
}

function jsPrompt(str) {
    var val;
    if(typeof prompt != 'undefined') {
        val = prompt(str);
    } else {
        print(str);
        val = readline();
    }
    return val == undefined ? '' : val.toString();
}

function jsEval(str) {
    var x = eval(str);
    return x == undefined ? '' : x.toString();
}

function isNull(obj) {
    return obj === null;
}

function jsRead(str) {
    return Number(str);
}

function jsShowI(val) {return val.toString();}
function jsShow(val) {
    var ret = val.toString();
    return val == Math.round(val) ? ret + '.0' : ret;
}

function jsGetMouseCoords(e) {
    var posx = 0;
    var posy = 0;
    if (!e) var e = window.event;
    if (e.pageX || e.pageY) 	{
	posx = e.pageX;
	posy = e.pageY;
    }
    else if (e.clientX || e.clientY) 	{
	posx = e.clientX + document.body.scrollLeft
	    + document.documentElement.scrollLeft;
	posy = e.clientY + document.body.scrollTop
	    + document.documentElement.scrollTop;
    }
    return [posx - (e.target.offsetLeft || 0),
	    posy - (e.target.offsetTop || 0)];
}

function jsSetCB(elem, evt, cb) {
    // Count return press in single line text box as a change event.
    if(evt == 'change' && elem.type.toLowerCase() == 'text') {
        setCB(elem, 'keyup', function(k) {
            if(k == '\n'.charCodeAt(0)) {
                A(cb,[[0,k.keyCode],0]);
            }
        });
    }

    var fun;
    switch(evt) {
    case 'click':
    case 'dblclick':
    case 'mouseup':
    case 'mousedown':
        fun = function(x) {
            var mpos = jsGetMouseCoords(x);
            var mx = [0,mpos[0]];
            var my = [0,mpos[1]];
            A(cb,[[0,x.button],[0,mx,my],0]);
        };
        break;
    case 'mousemove':
    case 'mouseover':
        fun = function(x) {
            var mpos = jsGetMouseCoords(x);
            var mx = [0,mpos[0]];
            var my = [0,mpos[1]];
            A(cb,[[0,mx,my],0]);
        };
        break;
    case 'keypress':
    case 'keyup':
    case 'keydown':
        fun = function(x) {A(cb,[[0,x.keyCode],0]);};
        break;        
    default:
        fun = function() {A(cb,[0]);};
        break;
    }
    return setCB(elem, evt, fun);
}

function setCB(elem, evt, cb) {
    if(elem.addEventListener) {
        elem.addEventListener(evt, cb, false);
        return true;
    } else if(elem.attachEvent) {
        elem.attachEvent('on'+evt, cb);
        return true;
    }
    return false;
}

function jsSetTimeout(msecs, cb) {
    window.setTimeout(function() {A(cb,[0]);}, msecs);
}

function jsGet(elem, prop) {
    return elem[prop].toString();
}

function jsSet(elem, prop, val) {
    elem[prop] = val;
}

function jsGetAttr(elem, prop) {
    if(elem.hasAttribute(prop)) {
        return elem.getAttribute(prop).toString();
    } else {
        return "";
    }
}

function jsSetAttr(elem, prop, val) {
    elem.setAttribute(prop, val);
}

function jsGetStyle(elem, prop) {
    return elem.style[prop].toString();
}

function jsSetStyle(elem, prop, val) {
    elem.style[prop] = val;
}

function jsKillChild(child, parent) {
    parent.removeChild(child);
}

function jsClearChildren(elem) {
    while(elem.hasChildNodes()){
        elem.removeChild(elem.lastChild);
    }
}

function jsFind(elem) {
    var e = document.getElementById(elem)
    if(e) {
        return [1,[0,e]];
    }
    return [0];
}

function jsCreateElem(tag) {
    return document.createElement(tag);
}

function jsCreateTextNode(str) {
    return document.createTextNode(str);
}

function jsGetChildBefore(elem) {
    elem = elem.previousSibling;
    while(elem) {
        if(typeof elem.tagName != 'undefined') {
            return [1,[0,elem]];
        }
        elem = elem.previousSibling;
    }
    return [0];
}

function jsGetLastChild(elem) {
    var len = elem.childNodes.length;
    for(var i = len-1; i >= 0; --i) {
        if(typeof elem.childNodes[i].tagName != 'undefined') {
            return [1,[0,elem.childNodes[i]]];
        }
    }
    return [0];
}


function jsGetFirstChild(elem) {
    var len = elem.childNodes.length;
    for(var i = 0; i < len; i++) {
        if(typeof elem.childNodes[i].tagName != 'undefined') {
            return [1,[0,elem.childNodes[i]]];
        }
    }
    return [0];
}


function jsGetChildren(elem) {
    var children = [0];
    var len = elem.childNodes.length;
    for(var i = len-1; i >= 0; --i) {
        if(typeof elem.childNodes[i].tagName != 'undefined') {
            children = [1, [0,elem.childNodes[i]], children];
        }
    }
    return children;
}

function jsSetChildren(elem, children) {
    children = E(children);
    jsClearChildren(elem, 0);
    while(children[0] === 1) {
        elem.appendChild(E(E(children[1])[1]));
        children = E(children[2]);
    }
}

function jsAppendChild(child, container) {
    container.appendChild(child);
}

function jsAddChildBefore(child, container, after) {
    container.insertBefore(child, after);
}

var jsRand = Math.random;

// Concatenate a Haskell list of JS strings
function jsCat(strs, sep) {
    var arr = [];
    strs = E(strs);
    while(strs[0]) {
        strs = E(strs);
        arr.push(E(strs[1])[1]);
        strs = E(strs[2]);
    }
    return arr.join(sep);
}

var jsJSONParse = JSON.parse;

// JSON stringify a string
function jsStringify(str) {
    return JSON.stringify(str);
}

// Parse a JSON message into a Haste.JSON.JSON value.
// As this pokes around inside Haskell values, it'll need to be updated if:
// * Haste.JSON.JSON changes;
// * E() starts to choke on non-thunks;
// * data constructor code generation changes; or
// * Just and Nothing change tags.
function jsParseJSON(str) {
    try {
        var js = JSON.parse(str);
        var hs = toHS(js);
    } catch(_) {
        return [0];
    }
    return [1,hs];
}

function toHS(obj) {
    switch(typeof obj) {
    case 'number':
        return [0, [0, jsRead(obj)]];
    case 'string':
        return [1, [0, obj]];
        break;
    case 'boolean':
        return [2, obj]; // Booleans are special wrt constructor tags!
        break;
    case 'object':
        if(obj instanceof Array) {
            return [3, arr2lst_json(obj, 0)];
        } else {
            // Object type but not array - it's a dictionary.
            // The RFC doesn't say anything about the ordering of keys, but
            // considering that lots of people rely on keys being "in order" as
            // defined by "the same way someone put them in at the other end,"
            // it's probably a good idea to put some cycles into meeting their
            // misguided expectations.
            var ks = [];
            for(var k in obj) {
                ks.unshift(k);
            }
            var xs = [0];
            for(var i = 0; i < ks.length; i++) {
                xs = [1, [0, [0,ks[i]], toHS(obj[ks[i]])], xs];
            }
            return [4, xs];
        }
    }
}

function arr2lst_json(arr, elem) {
    if(elem >= arr.length) {
        return [0];
    }
    return [1, toHS(arr[elem]), new T(function() {return arr2lst_json(arr,elem+1);})]
}

function arr2lst(arr, elem) {
    if(elem >= arr.length) {
        return [0];
    }
    return [1, arr[elem], new T(function() {return arr2lst(arr,elem+1);})]
}

function lst2arr(xs) {
    var arr = [];
    for(; xs[0]; xs = E(xs[2])) {
        arr.push(E(xs[1]));
    }
    return arr;
}

function ajaxReq(method, url, async, postdata, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, async);
    xhr.setRequestHeader('Cache-control', 'no-cache');
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) {
            if(xhr.status == 200) {
                A(cb,[[1,[0,xhr.responseText]],0]);
            } else {
                A(cb,[[0],0]); // Nothing
            }
        }
    }
    xhr.send(postdata);
}

// Create a little endian ArrayBuffer representation of something.
function toABHost(v, n, x) {
    var a = new ArrayBuffer(n);
    new window[v](a)[0] = x;
    return a;
}

function toABSwap(v, n, x) {
    var a = new ArrayBuffer(n);
    new window[v](a)[0] = x;
    var bs = new Uint8Array(a);
    for(var i = 0, j = n-1; i < j; ++i, --j) {
        var tmp = bs[i];
        bs[i] = bs[j];
        bs[j] = tmp;
    }
    return a;
}

window['toABle'] = toABHost;
window['toABbe'] = toABSwap;

// Swap byte order if host is not little endian.
var buffer = new ArrayBuffer(2);
new DataView(buffer).setInt16(0, 256, true);
if(new Int16Array(buffer)[0] !== 256) {
    window['toABle'] = toABSwap;
    window['toABbe'] = toABHost;
}

// MVar implementation.
// Since Haste isn't concurrent, takeMVar and putMVar don't block on empty
// and full MVars respectively, but terminate the program since they would
// otherwise be blocking forever.

function newMVar() {
    return ({empty: true});
}

function tryTakeMVar(mv) {
    if(mv.empty) {
        return [0, 0, undefined];
    } else {
        var val = mv.x;
        mv.empty = true;
        mv.x = null;
        return [0, 1, val];
    }
}

function takeMVar(mv) {
    if(mv.empty) {
        // TODO: real BlockedOnDeadMVar exception, perhaps?
        err("Attempted to take empty MVar!");
    }
    var val = mv.x;
    mv.empty = true;
    mv.x = null;
    return val;
}

function putMVar(mv, val) {
    if(!mv.empty) {
        // TODO: real BlockedOnDeadMVar exception, perhaps?
        err("Attempted to put full MVar!");
    }
    mv.empty = false;
    mv.x = val;
}

function tryPutMVar(mv, val) {
    if(!mv.empty) {
        return 0;
    } else {
        mv.empty = false;
        mv.x = val;
        return 1;
    }
}

function sameMVar(a, b) {
    return (a == b);
}

function isEmptyMVar(mv) {
    return mv.empty ? 1 : 0;
}

// Implementation of stable names.
// Unlike native GHC, the garbage collector isn't going to move data around
// in a way that we can detect, so each object could serve as its own stable
// name if it weren't for the fact we can't turn a JS reference into an
// integer.
// So instead, each object has a unique integer attached to it, which serves
// as its stable name.

var __next_stable_name = 1;

function makeStableName(x) {
    if(!x.stableName) {
        x.stableName = __next_stable_name;
        __next_stable_name += 1;
    }
    return x.stableName;
}

function eqStableName(x, y) {
    return (x == y) ? 1 : 0;
}

var Integer = function(bits, sign) {
  this.bits_ = [];
  this.sign_ = sign;

  var top = true;
  for (var i = bits.length - 1; i >= 0; i--) {
    var val = bits[i] | 0;
    if (!top || val != sign) {
      this.bits_[i] = val;
      top = false;
    }
  }
};

Integer.IntCache_ = {};

var I_fromInt = function(value) {
  if (-128 <= value && value < 128) {
    var cachedObj = Integer.IntCache_[value];
    if (cachedObj) {
      return cachedObj;
    }
  }

  var obj = new Integer([value | 0], value < 0 ? -1 : 0);
  if (-128 <= value && value < 128) {
    Integer.IntCache_[value] = obj;
  }
  return obj;
};

var I_fromNumber = function(value) {
  if (isNaN(value) || !isFinite(value)) {
    return Integer.ZERO;
  } else if (value < 0) {
    return I_negate(I_fromNumber(-value));
  } else {
    var bits = [];
    var pow = 1;
    for (var i = 0; value >= pow; i++) {
      bits[i] = (value / pow) | 0;
      pow *= Integer.TWO_PWR_32_DBL_;
    }
    return new Integer(bits, 0);
  }
};

var I_fromBits = function(bits) {
  var high = bits[bits.length - 1];
  return new Integer(bits, high & (1 << 31) ? -1 : 0);
};

var I_fromString = function(str, opt_radix) {
  if (str.length == 0) {
    throw Error('number format error: empty string');
  }

  var radix = opt_radix || 10;
  if (radix < 2 || 36 < radix) {
    throw Error('radix out of range: ' + radix);
  }

  if (str.charAt(0) == '-') {
    return I_negate(I_fromString(str.substring(1), radix));
  } else if (str.indexOf('-') >= 0) {
    throw Error('number format error: interior "-" character');
  }

  var radixToPower = I_fromNumber(Math.pow(radix, 8));

  var result = Integer.ZERO;
  for (var i = 0; i < str.length; i += 8) {
    var size = Math.min(8, str.length - i);
    var value = parseInt(str.substring(i, i + size), radix);
    if (size < 8) {
      var power = I_fromNumber(Math.pow(radix, size));
      result = I_add(I_mul(result, power), I_fromNumber(value));
    } else {
      result = I_mul(result, radixToPower);
      result = I_add(result, I_fromNumber(value));
    }
  }
  return result;
};


Integer.TWO_PWR_32_DBL_ = (1 << 16) * (1 << 16);
Integer.ZERO = I_fromInt(0);
Integer.ONE = I_fromInt(1);
Integer.TWO_PWR_24_ = I_fromInt(1 << 24);

var I_toInt = function(self) {
  return self.bits_.length > 0 ? self.bits_[0] : self.sign_;
};

var I_toWord = function(self) {
  return I_toInt(self) >>> 0;
};

var I_toNumber = function(self) {
  if (isNegative(self)) {
    return -I_toNumber(I_negate(self));
  } else {
    var val = 0;
    var pow = 1;
    for (var i = 0; i < self.bits_.length; i++) {
      val += I_getBitsUnsigned(self, i) * pow;
      pow *= Integer.TWO_PWR_32_DBL_;
    }
    return val;
  }
};

var I_getBits = function(self, index) {
  if (index < 0) {
    return 0;
  } else if (index < self.bits_.length) {
    return self.bits_[index];
  } else {
    return self.sign_;
  }
};

var I_getBitsUnsigned = function(self, index) {
  var val = I_getBits(self, index);
  return val >= 0 ? val : Integer.TWO_PWR_32_DBL_ + val;
};

var getSign = function(self) {
  return self.sign_;
};

var isZero = function(self) {
  if (self.sign_ != 0) {
    return false;
  }
  for (var i = 0; i < self.bits_.length; i++) {
    if (self.bits_[i] != 0) {
      return false;
    }
  }
  return true;
};

var isNegative = function(self) {
  return self.sign_ == -1;
};

var isOdd = function(self) {
  return (self.bits_.length == 0) && (self.sign_ == -1) ||
         (self.bits_.length > 0) && ((self.bits_[0] & 1) != 0);
};

var I_equals = function(self, other) {
  if (self.sign_ != other.sign_) {
    return false;
  }
  var len = Math.max(self.bits_.length, other.bits_.length);
  for (var i = 0; i < len; i++) {
    if (I_getBits(self, i) != I_getBits(other, i)) {
      return false;
    }
  }
  return true;
};

var I_notEquals = function(self, other) {
  return !I_equals(self, other);
};

var I_greaterThan = function(self, other) {
  return I_compare(self, other) > 0;
};

var I_greaterThanOrEqual = function(self, other) {
  return I_compare(self, other) >= 0;
};

var I_lessThan = function(self, other) {
  return I_compare(self, other) < 0;
};

var I_lessThanOrEqual = function(self, other) {
  return I_compare(self, other) <= 0;
};

var I_compare = function(self, other) {
  var diff = I_sub(self, other);
  if (isNegative(diff)) {
    return -1;
  } else if (isZero(diff)) {
    return 0;
  } else {
    return +1;
  }
};

var I_compareInt = function(self, other) {
  return I_compare(self, I_fromInt(other));
}

var shorten = function(self, numBits) {
  var arr_index = (numBits - 1) >> 5;
  var bit_index = (numBits - 1) % 32;
  var bits = [];
  for (var i = 0; i < arr_index; i++) {
    bits[i] = I_getBits(self, i);
  }
  var sigBits = bit_index == 31 ? 0xFFFFFFFF : (1 << (bit_index + 1)) - 1;
  var val = I_getBits(self, arr_index) & sigBits;
  if (val & (1 << bit_index)) {
    val |= 0xFFFFFFFF - sigBits;
    bits[arr_index] = val;
    return new Integer(bits, -1);
  } else {
    bits[arr_index] = val;
    return new Integer(bits, 0);
  }
};

var I_negate = function(self) {
  return I_add(not(self), Integer.ONE);
};

var I_add = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  var carry = 0;

  for (var i = 0; i <= len; i++) {
    var a1 = I_getBits(self, i) >>> 16;
    var a0 = I_getBits(self, i) & 0xFFFF;

    var b1 = I_getBits(other, i) >>> 16;
    var b0 = I_getBits(other, i) & 0xFFFF;

    var c0 = carry + a0 + b0;
    var c1 = (c0 >>> 16) + a1 + b1;
    carry = c1 >>> 16;
    c0 &= 0xFFFF;
    c1 &= 0xFFFF;
    arr[i] = (c1 << 16) | c0;
  }
  return I_fromBits(arr);
};

var I_sub = function(self, other) {
  return I_add(self, I_negate(other));
};

var I_mul = function(self, other) {
  if (isZero(self)) {
    return Integer.ZERO;
  } else if (isZero(other)) {
    return Integer.ZERO;
  }

  if (isNegative(self)) {
    if (isNegative(other)) {
      return I_mul(I_negate(self), I_negate(other));
    } else {
      return I_negate(I_mul(I_negate(self), other));
    }
  } else if (isNegative(other)) {
    return I_negate(I_mul(self, I_negate(other)));
  }

  if (I_lessThan(self, Integer.TWO_PWR_24_) &&
      I_lessThan(other, Integer.TWO_PWR_24_)) {
    return I_fromNumber(I_toNumber(self) * I_toNumber(other));
  }

  var len = self.bits_.length + other.bits_.length;
  var arr = [];
  for (var i = 0; i < 2 * len; i++) {
    arr[i] = 0;
  }
  for (var i = 0; i < self.bits_.length; i++) {
    for (var j = 0; j < other.bits_.length; j++) {
      var a1 = I_getBits(self, i) >>> 16;
      var a0 = I_getBits(self, i) & 0xFFFF;

      var b1 = I_getBits(other, j) >>> 16;
      var b0 = I_getBits(other, j) & 0xFFFF;

      arr[2 * i + 2 * j] += a0 * b0;
      Integer.carry16_(arr, 2 * i + 2 * j);
      arr[2 * i + 2 * j + 1] += a1 * b0;
      Integer.carry16_(arr, 2 * i + 2 * j + 1);
      arr[2 * i + 2 * j + 1] += a0 * b1;
      Integer.carry16_(arr, 2 * i + 2 * j + 1);
      arr[2 * i + 2 * j + 2] += a1 * b1;
      Integer.carry16_(arr, 2 * i + 2 * j + 2);
    }
  }

  for (var i = 0; i < len; i++) {
    arr[i] = (arr[2 * i + 1] << 16) | arr[2 * i];
  }
  for (var i = len; i < 2 * len; i++) {
    arr[i] = 0;
  }
  return new Integer(arr, 0);
};

Integer.carry16_ = function(bits, index) {
  while ((bits[index] & 0xFFFF) != bits[index]) {
    bits[index + 1] += bits[index] >>> 16;
    bits[index] &= 0xFFFF;
  }
};

var I_mod = function(self, other) {
  return I_rem(I_add(other, I_rem(self, other)), other);
}

var I_div = function(self, other) {
  if(I_greaterThan(self, Integer.ZERO) != I_greaterThan(other, Integer.ZERO)) {
    if(I_rem(self, other) != Integer.ZERO) {
      return I_sub(I_quot(self, other), Integer.ONE);
    }
  }
  return I_quot(self, other);
}

var I_quotRem = function(self, other) {
  return [0, I_quot(self, other), I_rem(self, other)];
}

var I_divMod = function(self, other) {
  return [0, I_div(self, other), I_mod(self, other)];
}

var I_quot = function(self, other) {
  if (isZero(other)) {
    throw Error('division by zero');
  } else if (isZero(self)) {
    return Integer.ZERO;
  }

  if (isNegative(self)) {
    if (isNegative(other)) {
      return I_quot(I_negate(self), I_negate(other));
    } else {
      return I_negate(I_quot(I_negate(self), other));
    }
  } else if (isNegative(other)) {
    return I_negate(I_quot(self, I_negate(other)));
  }

  var res = Integer.ZERO;
  var rem = self;
  while (I_greaterThanOrEqual(rem, other)) {
    var approx = Math.max(1, Math.floor(I_toNumber(rem) / I_toNumber(other)));
    var log2 = Math.ceil(Math.log(approx) / Math.LN2);
    var delta = (log2 <= 48) ? 1 : Math.pow(2, log2 - 48);
    var approxRes = I_fromNumber(approx);
    var approxRem = I_mul(approxRes, other);
    while (isNegative(approxRem) || I_greaterThan(approxRem, rem)) {
      approx -= delta;
      approxRes = I_fromNumber(approx);
      approxRem = I_mul(approxRes, other);
    }

    if (isZero(approxRes)) {
      approxRes = Integer.ONE;
    }

    res = I_add(res, approxRes);
    rem = I_sub(rem, approxRem);
  }
  return res;
};

var I_rem = function(self, other) {
  return I_sub(self, I_mul(I_quot(self, other), other));
};

var not = function(self) {
  var len = self.bits_.length;
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = ~self.bits_[i];
  }
  return new Integer(arr, ~self.sign_);
};

var I_and = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = I_getBits(self, i) & I_getBits(other, i);
  }
  return new Integer(arr, self.sign_ & other.sign_);
};

var I_or = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = I_getBits(self, i) | I_getBits(other, i);
  }
  return new Integer(arr, self.sign_ | other.sign_);
};

var I_xor = function(self, other) {
  var len = Math.max(self.bits_.length, other.bits_.length);
  var arr = [];
  for (var i = 0; i < len; i++) {
    arr[i] = I_getBits(self, i) ^ I_getBits(other, i);
  }
  return new Integer(arr, self.sign_ ^ other.sign_);
};

var I_shiftLeft = function(self, numBits) {
  var arr_delta = numBits >> 5;
  var bit_delta = numBits % 32;
  var len = self.bits_.length + arr_delta + (bit_delta > 0 ? 1 : 0);
  var arr = [];
  for (var i = 0; i < len; i++) {
    if (bit_delta > 0) {
      arr[i] = (I_getBits(self, i - arr_delta) << bit_delta) |
               (I_getBits(self, i - arr_delta - 1) >>> (32 - bit_delta));
    } else {
      arr[i] = I_getBits(self, i - arr_delta);
    }
  }
  return new Integer(arr, self.sign_);
};

var I_shiftRight = function(self, numBits) {
  var arr_delta = numBits >> 5;
  var bit_delta = numBits % 32;
  var len = self.bits_.length - arr_delta;
  var arr = [];
  for (var i = 0; i < len; i++) {
    if (bit_delta > 0) {
      arr[i] = (I_getBits(self, i + arr_delta) >>> bit_delta) |
               (I_getBits(self, i + arr_delta + 1) << (32 - bit_delta));
    } else {
      arr[i] = I_getBits(self, i + arr_delta);
    }
  }
  return new Integer(arr, self.sign_);
};

var I_signum = function(self) {
  var cmp = I_compare(self, Integer.ZERO);
  if(cmp > 0) {
    return Integer.ONE
  }
  if(cmp < 0) {
    return I_sub(Integer.ZERO, Integer.ONE);
  }
  return Integer.ZERO;
};

var I_abs = function(self) {
  if(I_compare(self, Integer.ZERO) < 0) {
    return I_sub(Integer.ZERO, self);
  }
  return self;
};

var I_decodeDouble = function(x) {
  var dec = decodeDouble(x);
  var mantissa = I_fromBits([dec[3], dec[2]]);
  if(dec[1] < 0) {
    mantissa = I_negate(mantissa);
  }
  return [0, dec[4], mantissa];
}

var I_toString = function(self) {
  var radix = 10;

  if (isZero(self)) {
    return '0';
  } else if (isNegative(self)) {
    return '-' + I_toString(I_negate(self));
  }

  var radixToPower = I_fromNumber(Math.pow(radix, 6));

  var rem = self;
  var result = '';
  while (true) {
    var remDiv = I_div(rem, radixToPower);
    var intval = I_toInt(I_sub(rem, I_mul(remDiv, radixToPower)));
    var digits = intval.toString();

    rem = remDiv;
    if (isZero(rem)) {
      return digits + result;
    } else {
      while (digits.length < 6) {
        digits = '0' + digits;
      }
      result = '' + digits + result;
    }
  }
};

var I_fromRat = function(a, b) {
    return I_toNumber(a) / I_toNumber(b);
}

function I_fromInt64(x) {
    return I_fromBits([x.getLowBits(), x.getHighBits()]);
}

function I_toInt64(x) {
    return Long.fromBits(I_getBits(x, 0), I_getBits(x, 1));
}

function I_fromWord64(x) {
    return x;
}

function I_toWord64(x) {
    return I_rem(I_add(__w64_max, x), __w64_max);
}

// Copyright 2009 The Closure Library Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var Long = function(low, high) {
  this.low_ = low | 0;
  this.high_ = high | 0;
};

Long.IntCache_ = {};

Long.fromInt = function(value) {
  if (-128 <= value && value < 128) {
    var cachedObj = Long.IntCache_[value];
    if (cachedObj) {
      return cachedObj;
    }
  }

  var obj = new Long(value | 0, value < 0 ? -1 : 0);
  if (-128 <= value && value < 128) {
    Long.IntCache_[value] = obj;
  }
  return obj;
};

Long.fromNumber = function(value) {
  if (isNaN(value) || !isFinite(value)) {
    return Long.ZERO;
  } else if (value <= -Long.TWO_PWR_63_DBL_) {
    return Long.MIN_VALUE;
  } else if (value + 1 >= Long.TWO_PWR_63_DBL_) {
    return Long.MAX_VALUE;
  } else if (value < 0) {
    return Long.fromNumber(-value).negate();
  } else {
    return new Long(
        (value % Long.TWO_PWR_32_DBL_) | 0,
        (value / Long.TWO_PWR_32_DBL_) | 0);
  }
};

Long.fromBits = function(lowBits, highBits) {
  return new Long(lowBits, highBits);
};

Long.TWO_PWR_16_DBL_ = 1 << 16;
Long.TWO_PWR_24_DBL_ = 1 << 24;
Long.TWO_PWR_32_DBL_ =
    Long.TWO_PWR_16_DBL_ * Long.TWO_PWR_16_DBL_;
Long.TWO_PWR_31_DBL_ =
    Long.TWO_PWR_32_DBL_ / 2;
Long.TWO_PWR_48_DBL_ =
    Long.TWO_PWR_32_DBL_ * Long.TWO_PWR_16_DBL_;
Long.TWO_PWR_64_DBL_ =
    Long.TWO_PWR_32_DBL_ * Long.TWO_PWR_32_DBL_;
Long.TWO_PWR_63_DBL_ =
    Long.TWO_PWR_64_DBL_ / 2;
Long.ZERO = Long.fromInt(0);
Long.ONE = Long.fromInt(1);
Long.NEG_ONE = Long.fromInt(-1);
Long.MAX_VALUE =
    Long.fromBits(0xFFFFFFFF | 0, 0x7FFFFFFF | 0);
Long.MIN_VALUE = Long.fromBits(0, 0x80000000 | 0);
Long.TWO_PWR_24_ = Long.fromInt(1 << 24);

Long.prototype.toInt = function() {
  return this.low_;
};

Long.prototype.toNumber = function() {
  return this.high_ * Long.TWO_PWR_32_DBL_ +
         this.getLowBitsUnsigned();
};

Long.prototype.getHighBits = function() {
  return this.high_;
};

Long.prototype.getLowBits = function() {
  return this.low_;
};

Long.prototype.getLowBitsUnsigned = function() {
  return (this.low_ >= 0) ?
      this.low_ : Long.TWO_PWR_32_DBL_ + this.low_;
};

Long.prototype.isZero = function() {
  return this.high_ == 0 && this.low_ == 0;
};

Long.prototype.isNegative = function() {
  return this.high_ < 0;
};

Long.prototype.isOdd = function() {
  return (this.low_ & 1) == 1;
};

Long.prototype.equals = function(other) {
  return (this.high_ == other.high_) && (this.low_ == other.low_);
};

Long.prototype.notEquals = function(other) {
  return (this.high_ != other.high_) || (this.low_ != other.low_);
};

Long.prototype.lessThan = function(other) {
  return this.compare(other) < 0;
};

Long.prototype.lessThanOrEqual = function(other) {
  return this.compare(other) <= 0;
};

Long.prototype.greaterThan = function(other) {
  return this.compare(other) > 0;
};

Long.prototype.greaterThanOrEqual = function(other) {
  return this.compare(other) >= 0;
};

Long.prototype.compare = function(other) {
  if (this.equals(other)) {
    return 0;
  }

  var thisNeg = this.isNegative();
  var otherNeg = other.isNegative();
  if (thisNeg && !otherNeg) {
    return -1;
  }
  if (!thisNeg && otherNeg) {
    return 1;
  }

  if (this.subtract(other).isNegative()) {
    return -1;
  } else {
    return 1;
  }
};

Long.prototype.negate = function() {
  if (this.equals(Long.MIN_VALUE)) {
    return Long.MIN_VALUE;
  } else {
    return this.not().add(Long.ONE);
  }
};

Long.prototype.add = function(other) {
  var a48 = this.high_ >>> 16;
  var a32 = this.high_ & 0xFFFF;
  var a16 = this.low_ >>> 16;
  var a00 = this.low_ & 0xFFFF;

  var b48 = other.high_ >>> 16;
  var b32 = other.high_ & 0xFFFF;
  var b16 = other.low_ >>> 16;
  var b00 = other.low_ & 0xFFFF;

  var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
  c00 += a00 + b00;
  c16 += c00 >>> 16;
  c00 &= 0xFFFF;
  c16 += a16 + b16;
  c32 += c16 >>> 16;
  c16 &= 0xFFFF;
  c32 += a32 + b32;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c48 += a48 + b48;
  c48 &= 0xFFFF;
  return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32);
};

Long.prototype.subtract = function(other) {
  return this.add(other.negate());
};

Long.prototype.multiply = function(other) {
  if (this.isZero()) {
    return Long.ZERO;
  } else if (other.isZero()) {
    return Long.ZERO;
  }

  if (this.equals(Long.MIN_VALUE)) {
    return other.isOdd() ? Long.MIN_VALUE : Long.ZERO;
  } else if (other.equals(Long.MIN_VALUE)) {
    return this.isOdd() ? Long.MIN_VALUE : Long.ZERO;
  }

  if (this.isNegative()) {
    if (other.isNegative()) {
      return this.negate().multiply(other.negate());
    } else {
      return this.negate().multiply(other).negate();
    }
  } else if (other.isNegative()) {
    return this.multiply(other.negate()).negate();
  }

  if (this.lessThan(Long.TWO_PWR_24_) &&
      other.lessThan(Long.TWO_PWR_24_)) {
    return Long.fromNumber(this.toNumber() * other.toNumber());
  }

  var a48 = this.high_ >>> 16;
  var a32 = this.high_ & 0xFFFF;
  var a16 = this.low_ >>> 16;
  var a00 = this.low_ & 0xFFFF;

  var b48 = other.high_ >>> 16;
  var b32 = other.high_ & 0xFFFF;
  var b16 = other.low_ >>> 16;
  var b00 = other.low_ & 0xFFFF;

  var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
  c00 += a00 * b00;
  c16 += c00 >>> 16;
  c00 &= 0xFFFF;
  c16 += a16 * b00;
  c32 += c16 >>> 16;
  c16 &= 0xFFFF;
  c16 += a00 * b16;
  c32 += c16 >>> 16;
  c16 &= 0xFFFF;
  c32 += a32 * b00;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c32 += a16 * b16;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c32 += a00 * b32;
  c48 += c32 >>> 16;
  c32 &= 0xFFFF;
  c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
  c48 &= 0xFFFF;
  return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32);
};

Long.prototype.div = function(other) {
  if (other.isZero()) {
    throw Error('division by zero');
  } else if (this.isZero()) {
    return Long.ZERO;
  }

  if (this.equals(Long.MIN_VALUE)) {
    if (other.equals(Long.ONE) ||
        other.equals(Long.NEG_ONE)) {
      return Long.MIN_VALUE;
    } else if (other.equals(Long.MIN_VALUE)) {
      return Long.ONE;
    } else {
      var halfThis = this.shiftRight(1);
      var approx = halfThis.div(other).shiftLeft(1);
      if (approx.equals(Long.ZERO)) {
        return other.isNegative() ? Long.ONE : Long.NEG_ONE;
      } else {
        var rem = this.subtract(other.multiply(approx));
        var result = approx.add(rem.div(other));
        return result;
      }
    }
  } else if (other.equals(Long.MIN_VALUE)) {
    return Long.ZERO;
  }

  if (this.isNegative()) {
    if (other.isNegative()) {
      return this.negate().div(other.negate());
    } else {
      return this.negate().div(other).negate();
    }
  } else if (other.isNegative()) {
    return this.div(other.negate()).negate();
  }

  var res = Long.ZERO;
  var rem = this;
  while (rem.greaterThanOrEqual(other)) {
    var approx = Math.max(1, Math.floor(rem.toNumber() / other.toNumber()));

    var log2 = Math.ceil(Math.log(approx) / Math.LN2);
    var delta = (log2 <= 48) ? 1 : Math.pow(2, log2 - 48);

    var approxRes = Long.fromNumber(approx);
    var approxRem = approxRes.multiply(other);
    while (approxRem.isNegative() || approxRem.greaterThan(rem)) {
      approx -= delta;
      approxRes = Long.fromNumber(approx);
      approxRem = approxRes.multiply(other);
    }

    if (approxRes.isZero()) {
      approxRes = Long.ONE;
    }

    res = res.add(approxRes);
    rem = rem.subtract(approxRem);
  }
  return res;
};

Long.prototype.modulo = function(other) {
  return this.subtract(this.div(other).multiply(other));
};

Long.prototype.not = function() {
  return Long.fromBits(~this.low_, ~this.high_);
};

Long.prototype.and = function(other) {
  return Long.fromBits(this.low_ & other.low_,
                                 this.high_ & other.high_);
};

Long.prototype.or = function(other) {
  return Long.fromBits(this.low_ | other.low_,
                                 this.high_ | other.high_);
};

Long.prototype.xor = function(other) {
  return Long.fromBits(this.low_ ^ other.low_,
                                 this.high_ ^ other.high_);
};

Long.prototype.shiftLeft = function(numBits) {
  numBits &= 63;
  if (numBits == 0) {
    return this;
  } else {
    var low = this.low_;
    if (numBits < 32) {
      var high = this.high_;
      return Long.fromBits(
          low << numBits,
          (high << numBits) | (low >>> (32 - numBits)));
    } else {
      return Long.fromBits(0, low << (numBits - 32));
    }
  }
};

Long.prototype.shiftRight = function(numBits) {
  numBits &= 63;
  if (numBits == 0) {
    return this;
  } else {
    var high = this.high_;
    if (numBits < 32) {
      var low = this.low_;
      return Long.fromBits(
          (low >>> numBits) | (high << (32 - numBits)),
          high >> numBits);
    } else {
      return Long.fromBits(
          high >> (numBits - 32),
          high >= 0 ? 0 : -1);
    }
  }
};

Long.prototype.shiftRightUnsigned = function(numBits) {
  numBits &= 63;
  if (numBits == 0) {
    return this;
  } else {
    var high = this.high_;
    if (numBits < 32) {
      var low = this.low_;
      return Long.fromBits(
          (low >>> numBits) | (high << (32 - numBits)),
          high >>> numBits);
    } else if (numBits == 32) {
      return Long.fromBits(high, 0);
    } else {
      return Long.fromBits(high >>> (numBits - 32), 0);
    }
  }
};



// Int64
function hs_eqInt64(x, y) {return x.equals(y);}
function hs_neInt64(x, y) {return !x.equals(y);}
function hs_ltInt64(x, y) {return x.compare(y) < 0;}
function hs_leInt64(x, y) {return x.compare(y) <= 0;}
function hs_gtInt64(x, y) {return x.compare(y) > 0;}
function hs_geInt64(x, y) {return x.compare(y) >= 0;}
function hs_quotInt64(x, y) {return x.div(y);}
function hs_remInt64(x, y) {return x.modulo(y);}
function hs_plusInt64(x, y) {return x.add(y);}
function hs_minusInt64(x, y) {return x.subtract(y);}
function hs_timesInt64(x, y) {return x.multiply(y);}
function hs_negateInt64(x) {return x.negate();}
function hs_uncheckedIShiftL64(x, bits) {x.shiftLeft(bits);}
function hs_uncheckedIShiftRA64(x, bits) {x.shiftRight(bits);}
function hs_uncheckedIShiftRL64(x, bits) {x.shiftRightUnsigned(bits);}
function hs_intToInt64(x) {return new Long(x, 0);}
function hs_int64ToInt(x) {return x.toInt();}



// Word64
function hs_wordToWord64(x) {
    return I_fromInt(x);
}
function hs_word64ToWord(x) {
    return I_toInt(x);
}
function hs_mkWord64(low, high) {
    return I_fromBits([low, high]);
}

var hs_and64 = I_and;
var hs_or64 = I_or;
var hs_xor64 = I_xor;
var __i64_all_ones = I_fromBits([0xffffffff, 0xffffffff]);
function hs_not64(x) {
    return I_xor(x, __i64_all_ones);
}
var hs_eqWord64 = I_equals;
var hs_neWord64 = I_notEquals;
var hs_ltWord64 = I_lessThan;
var hs_leWord64 = I_lessThanOrEqual;
var hs_gtWord64 = I_greaterThan;
var hs_geWord64 = I_greaterThanOrEqual;
var hs_quotWord64 = I_quot;
var hs_remWord64 = I_rem;
var __w64_max = I_fromBits([0,0,1]);
function hs_uncheckedShiftL64(x, bits) {
    return I_rem(I_shiftLeft(x, bits), __w64_max);
}
var hs_uncheckedShiftRL64 = I_shiftRight;
function hs_int64ToWord64(x) {
    var tmp = I_add(__w64_max, I_fromBits([x.getLowBits(), x.getHighBits()]));
    return I_rem(tmp, __w64_max);
}
function hs_word64ToInt64(x) {
    return Long.fromBits(I_getBits(x, 0), I_getBits(x, 1));
}

// Joseph Myers' MD5 implementation; used under the BSD license.

function md5cycle(x, k) {
var a = x[0], b = x[1], c = x[2], d = x[3];

a = ff(a, b, c, d, k[0], 7, -680876936);
d = ff(d, a, b, c, k[1], 12, -389564586);
c = ff(c, d, a, b, k[2], 17,  606105819);
b = ff(b, c, d, a, k[3], 22, -1044525330);
a = ff(a, b, c, d, k[4], 7, -176418897);
d = ff(d, a, b, c, k[5], 12,  1200080426);
c = ff(c, d, a, b, k[6], 17, -1473231341);
b = ff(b, c, d, a, k[7], 22, -45705983);
a = ff(a, b, c, d, k[8], 7,  1770035416);
d = ff(d, a, b, c, k[9], 12, -1958414417);
c = ff(c, d, a, b, k[10], 17, -42063);
b = ff(b, c, d, a, k[11], 22, -1990404162);
a = ff(a, b, c, d, k[12], 7,  1804603682);
d = ff(d, a, b, c, k[13], 12, -40341101);
c = ff(c, d, a, b, k[14], 17, -1502002290);
b = ff(b, c, d, a, k[15], 22,  1236535329);

a = gg(a, b, c, d, k[1], 5, -165796510);
d = gg(d, a, b, c, k[6], 9, -1069501632);
c = gg(c, d, a, b, k[11], 14,  643717713);
b = gg(b, c, d, a, k[0], 20, -373897302);
a = gg(a, b, c, d, k[5], 5, -701558691);
d = gg(d, a, b, c, k[10], 9,  38016083);
c = gg(c, d, a, b, k[15], 14, -660478335);
b = gg(b, c, d, a, k[4], 20, -405537848);
a = gg(a, b, c, d, k[9], 5,  568446438);
d = gg(d, a, b, c, k[14], 9, -1019803690);
c = gg(c, d, a, b, k[3], 14, -187363961);
b = gg(b, c, d, a, k[8], 20,  1163531501);
a = gg(a, b, c, d, k[13], 5, -1444681467);
d = gg(d, a, b, c, k[2], 9, -51403784);
c = gg(c, d, a, b, k[7], 14,  1735328473);
b = gg(b, c, d, a, k[12], 20, -1926607734);

a = hh(a, b, c, d, k[5], 4, -378558);
d = hh(d, a, b, c, k[8], 11, -2022574463);
c = hh(c, d, a, b, k[11], 16,  1839030562);
b = hh(b, c, d, a, k[14], 23, -35309556);
a = hh(a, b, c, d, k[1], 4, -1530992060);
d = hh(d, a, b, c, k[4], 11,  1272893353);
c = hh(c, d, a, b, k[7], 16, -155497632);
b = hh(b, c, d, a, k[10], 23, -1094730640);
a = hh(a, b, c, d, k[13], 4,  681279174);
d = hh(d, a, b, c, k[0], 11, -358537222);
c = hh(c, d, a, b, k[3], 16, -722521979);
b = hh(b, c, d, a, k[6], 23,  76029189);
a = hh(a, b, c, d, k[9], 4, -640364487);
d = hh(d, a, b, c, k[12], 11, -421815835);
c = hh(c, d, a, b, k[15], 16,  530742520);
b = hh(b, c, d, a, k[2], 23, -995338651);

a = ii(a, b, c, d, k[0], 6, -198630844);
d = ii(d, a, b, c, k[7], 10,  1126891415);
c = ii(c, d, a, b, k[14], 15, -1416354905);
b = ii(b, c, d, a, k[5], 21, -57434055);
a = ii(a, b, c, d, k[12], 6,  1700485571);
d = ii(d, a, b, c, k[3], 10, -1894986606);
c = ii(c, d, a, b, k[10], 15, -1051523);
b = ii(b, c, d, a, k[1], 21, -2054922799);
a = ii(a, b, c, d, k[8], 6,  1873313359);
d = ii(d, a, b, c, k[15], 10, -30611744);
c = ii(c, d, a, b, k[6], 15, -1560198380);
b = ii(b, c, d, a, k[13], 21,  1309151649);
a = ii(a, b, c, d, k[4], 6, -145523070);
d = ii(d, a, b, c, k[11], 10, -1120210379);
c = ii(c, d, a, b, k[2], 15,  718787259);
b = ii(b, c, d, a, k[9], 21, -343485551);

x[0] = add32(a, x[0]);
x[1] = add32(b, x[1]);
x[2] = add32(c, x[2]);
x[3] = add32(d, x[3]);

}

function cmn(q, a, b, x, s, t) {
a = add32(add32(a, q), add32(x, t));
return add32((a << s) | (a >>> (32 - s)), b);
}

function ff(a, b, c, d, x, s, t) {
return cmn((b & c) | ((~b) & d), a, b, x, s, t);
}

function gg(a, b, c, d, x, s, t) {
return cmn((b & d) | (c & (~d)), a, b, x, s, t);
}

function hh(a, b, c, d, x, s, t) {
return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a, b, c, d, x, s, t) {
return cmn(c ^ (b | (~d)), a, b, x, s, t);
}

function md51(s) {
var n = s.length,
state = [1732584193, -271733879, -1732584194, 271733878], i;
for (i=64; i<=s.length; i+=64) {
md5cycle(state, md5blk(s.substring(i-64, i)));
}
s = s.substring(i-64);
var tail = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
for (i=0; i<s.length; i++)
tail[i>>2] |= s.charCodeAt(i) << ((i%4) << 3);
tail[i>>2] |= 0x80 << ((i%4) << 3);
if (i > 55) {
md5cycle(state, tail);
for (i=0; i<16; i++) tail[i] = 0;
}
tail[14] = n*8;
md5cycle(state, tail);
return state;
}

function md5blk(s) {
var md5blks = [], i;
for (i=0; i<64; i+=4) {
md5blks[i>>2] = s.charCodeAt(i)
+ (s.charCodeAt(i+1) << 8)
+ (s.charCodeAt(i+2) << 16)
+ (s.charCodeAt(i+3) << 24);
}
return md5blks;
}

var hex_chr = '0123456789abcdef'.split('');

function rhex(n)
{
var s='', j=0;
for(; j<4; j++)
s += hex_chr[(n >> (j * 8 + 4)) & 0x0F]
+ hex_chr[(n >> (j * 8)) & 0x0F];
return s;
}

function hex(x) {
for (var i=0; i<x.length; i++)
x[i] = rhex(x[i]);
return x.join('');
}

function md5(s) {
return hex(md51(s));
}

function add32(a, b) {
return (a + b) & 0xFFFFFFFF;
}

// Functions for dealing with arrays.

function newArr(n, x) {
    var arr = [];
    for(; n >= 0; --n) {
        arr.push(x);
    }
    return arr;
}

// Create all views at once; perhaps it's wasteful, but it's better than having
// to check for the right view at each read or write.
function newByteArr(n) {
    // Pad the thing to multiples of 8.
    var padding = 8 - n % 8;
    if(padding < 8) {
        n += padding;
    }
    var arr = {};
    var buffer = new ArrayBuffer(n);
    var views = {};
    views['i8']  = new Int8Array(buffer);
    views['i16'] = new Int16Array(buffer);
    views['i32'] = new Int32Array(buffer);
    views['w8']  = new Uint8Array(buffer);
    views['w16'] = new Uint16Array(buffer);
    views['w32'] = new Uint32Array(buffer);
    views['f32'] = new Float32Array(buffer);
    views['f64'] = new Float64Array(buffer);
    arr['b'] = buffer;
    arr['v'] = views;
    // ByteArray and Addr are the same thing, so keep an offset if we get
    // casted.
    arr['off'] = 0;
    return arr;
}

// An attempt at emulating pointers enough for ByteString and Text to be
// usable without patching the hell out of them.
// The general idea is that Addr# is a byte array with an associated offset.

function plusAddr(addr, off) {
    var newaddr = {};
    newaddr['off'] = addr['off'] + off;
    newaddr['b']   = addr['b'];
    newaddr['v']   = addr['v'];
    return newaddr;
}

function writeOffAddr(type, elemsize, addr, off, x) {
    addr['v'][type][addr.off/elemsize + off] = x;
}

function readOffAddr(type, elemsize, addr, off) {
    return addr['v'][type][addr.off/elemsize + off];
}

// Two addresses are equal if they point to the same buffer and have the same
// offset. For other comparisons, just use the offsets - nobody in their right
// mind would check if one pointer is less than another, completely unrelated,
// pointer and then act on that information anyway.
function addrEq(a, b) {
    if(a == b) {
        return true;
    }
    return a && b && a['b'] == b['b'] && a['off'] == b['off'];
}

function addrLT(a, b) {
    if(a) {
        return b && a['off'] < b['off'];
    } else {
        return (b != 0); 
    }
}

function addrGT(a, b) {
    if(b) {
        return a && a['off'] > b['off'];
    } else {
        return (a != 0);
    }
}

function withChar(f, charCode) {
    return f(String.fromCharCode(charCode)).charCodeAt(0);
}

function u_towlower(charCode) {
    return withChar(function(c) {return c.toLowerCase()}, charCode);
}

function u_towupper(charCode) {
    return withChar(function(c) {return c.toUpperCase()}, charCode);
}

var u_towtitle = u_towupper;

function u_iswupper(charCode) {
    var c = String.fromCharCode(charCode);
    return c == c.toUpperCase() && c != c.toLowerCase();
}

function u_iswlower(charCode) {
    var c = String.fromCharCode(charCode);
    return  c == c.toLowerCase() && c != c.toUpperCase();
}

function u_iswdigit(charCode) {
    return charCode >= 48 && charCode <= 57;
}

function u_iswcntrl(charCode) {
    return charCode <= 0x1f || charCode == 0x7f;
}

function u_iswspace(charCode) {
    var c = String.fromCharCode(charCode);
    return c.replace(/\s/g,'') != c;
}

function u_iswalpha(charCode) {
    var c = String.fromCharCode(charCode);
    return c.replace(__hs_alphare, '') != c;
}

function u_iswalnum(charCode) {
    return u_iswdigit(charCode) || u_iswalpha(charCode);
}

function u_iswprint(charCode) {
    return !u_iswcntrl(charCode);
}

function u_gencat(c) {
    throw 'u_gencat is only supported with --full-unicode.';
}

// Regex that matches any alphabetic character in any language. Horrible thing.
var __hs_alphare = /[\u0041-\u005A\u0061-\u007A\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0\u08A2-\u08AC\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097F\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191C\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA697\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA80-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]/g;

// 2D Canvas drawing primitives.
function jsHasCtx2D(elem) {return !!elem.getContext;}
function jsGetCtx2D(elem) {return elem.getContext('2d');}
function jsBeginPath(ctx) {ctx.beginPath();}
function jsMoveTo(ctx, x, y) {ctx.moveTo(x, y);}
function jsLineTo(ctx, x, y) {ctx.lineTo(x, y);}
function jsStroke(ctx) {ctx.stroke();}
function jsFill(ctx) {ctx.fill();}
function jsRotate(ctx, radians) {ctx.rotate(radians);}
function jsTranslate(ctx, x, y) {ctx.translate(x, y);}
function jsScale(ctx, x, y) {ctx.scale(x, y);}
function jsPushState(ctx) {ctx.save();}
function jsPopState(ctx) {ctx.restore();}
function jsResetCanvas(el) {el.width = el.width;}
function jsDrawImage(ctx, img, x, y) {ctx.drawImage(img, x, y);}
function jsDrawImageClipped(ctx, img, x, y, cx, cy, cw, ch) {
    ctx.drawImage(img, cx, cy, cw, ch, x, y, cw, ch);
}
function jsDrawText(ctx, str, x, y) {ctx.fillText(str, x, y);}
function jsClip(ctx) {ctx.clip();}
function jsArc(ctx, x, y, radius, fromAngle, toAngle) {
    ctx.arc(x, y, radius, fromAngle, toAngle);
}
function jsCanvasToDataURL(el) {return el.toDataURL('image/png');}

// Simulate handles.
// When implementing new handles, remember that passed strings may be thunks,
// and so need to be evaluated before use.

function jsNewHandle(init, read, write, flush, close, seek, tell) {
    var h = {
        read: read || function() {},
        write: write || function() {},
        seek: seek || function() {},
        tell: tell || function() {},
        close: close || function() {},
        flush: flush || function() {}
    };
    init.call(h);
    return h;
}

function jsReadHandle(h, len) {return h.read(len);}
function jsWriteHandle(h, str) {return h.write(str);}
function jsFlushHandle(h) {return h.flush();}
function jsCloseHandle(h) {return h.close();}

function jsMkConWriter(op) {
    return function(str) {
        str = E(str);
        var lines = (this.buf + str).split('\n');
        for(var i = 0; i < lines.length-1; ++i) {
            op.call(console, lines[i]);
        }
        this.buf = lines[lines.length-1];
    }
}

function jsMkStdout() {
    return jsNewHandle(
        function() {this.buf = '';},
        function(_) {return '';},
        jsMkConWriter(console.log),
        function() {console.log(this.buf); this.buf = '';}
    );
}

function jsMkStderr() {
    return jsNewHandle(
        function() {this.buf = '';},
        function(_) {return '';},
        jsMkConWriter(console.warn),
        function() {console.warn(this.buf); this.buf = '';}
    );
}

function jsMkStdin() {
    return jsNewHandle(
        function() {this.buf = '';},
        function(len) {
            while(this.buf.length < len) {
                this.buf += prompt('[stdin]') + '\n';
            }
            var ret = this.buf.substr(0, len);
            this.buf = this.buf.substr(len);
            return ret;
        }
    );
}

var _0=false,_1=new T(function(){return [0,"(function(e){return e.parentNode;})"];}),_2=function(_3){var _4=A(_3,[_]);return E(_4);},_5=function(_6){return _2(function(_){var _=0;return eval(E(_6)[1]);});},_7=new T(function(){return _5(_1);}),_8=[0,0],_9=[0],_a=function(_b,_){return _9;},_c=function(_){return _9;},_d=[0,_c,_a],_e=2,_f=[1],_g=[0],_h=[0,_g,_8,_e,_d,_0,_f],_i=function(_){var _=0,_j=newMVar(),_=putMVar(_j,_h);return [0,_j];},_k=new T(function(){return _2(_i);}),_l=function(_m,_n,_){var _o=E(_k)[1],_p=takeMVar(_o),_q=A(_m,[_p,_]),_r=E(_q),_s=E(_r[1]),_t=_s[1],_u=_s[2],_=putMVar(_o,new T(function(){var _v=E(_r[2]);return [0,_v[1],_v[2],_v[3],_v[4],_0,_v[6]];}));if(!E(E(_p)[5])){var _w=A(_t,[_n,_]);return _u;}else{var _x=A(_7,[E(E(_n)[1]),_]),_y=A(_t,[[0,_x],_]);return _u;}},_z=unCStr("id"),_A=0,_B=function(_C,_D,_E,_F){return A(_C,[new T(function(){return function(_){var _G=jsSetAttr(E(_D)[1],toJSStr(E(_E)),toJSStr(E(_F)));return _A;};})]);},_H=function(_I){return E(_I);},_J=function(_K,_L,_M,_){var _N=E(_L),_O=A(_K,[_M,_]),_P=A(_B,[_H,_O,_N[1],_N[2],_]);return _O;},_Q=function(_R,_S){while(1){var _T=(function(_U,_V){var _W=E(_V);if(!_W[0]){return E(_U);}else{_R=function(_X,_){return _J(_U,_W[1],_X,_);};_S=_W[2];return null;}})(_R,_S);if(_T!=null){return _T;}}},_Y=function(_Z,_10,_){return [0,_A,_Z];},_11=function(_12,_){return [0,_12,_12];},_13=[0,coercionToken],_14=function(_15,_16,_){var _17=A(_15,[_]);return A(_16,[_]);},_18=function(_19,_1a,_){return _14(_19,_1a,_);},_1b=function(_1c,_1d,_){var _1e=A(_1c,[_]);return A(_1d,[_1e,_]);},_1f=unCStr("base"),_1g=unCStr("GHC.IO.Exception"),_1h=unCStr("IOException"),_1i=[0,I_fromBits([4053623282,1685460941]),I_fromBits([3693590983,2507416641]),_1f,_1g,_1h],_1j=[0,I_fromBits([4053623282,1685460941]),I_fromBits([3693590983,2507416641]),_1i,_g],_1k=function(_1l){return E(_1j);},_1m=function(_1n){return E(E(_1n)[1]);},_1o=unCStr("Maybe.fromJust: Nothing"),_1p=new T(function(){return err(_1o);}),_1q=function(_1r,_1s,_1t){var _1u=new T(function(){var _1v=A(_1r,[_1t]),_1w=A(_1s,[new T(function(){var _1x=E(_1u);return _1x[0]==0?E(_1p):E(_1x[1]);})]),_1y=hs_eqWord64(_1v[1],_1w[1]);if(!E(_1y)){return [0];}else{var _1z=hs_eqWord64(_1v[2],_1w[2]);return E(_1z)==0?[0]:[1,_1t];}});return E(_1u);},_1A=function(_1B){var _1C=E(_1B);return _1q(_1m(_1C[1]),_1k,_1C[2]);},_1D=unCStr(": "),_1E=[0,41],_1F=unCStr(" ("),_1G=function(_1H,_1I){var _1J=E(_1H);return _1J[0]==0?E(_1I):[1,_1J[1],new T(function(){return _1G(_1J[2],_1I);})];},_1K=unCStr("already exists"),_1L=unCStr("does not exist"),_1M=unCStr("protocol error"),_1N=unCStr("failed"),_1O=unCStr("invalid argument"),_1P=unCStr("inappropriate type"),_1Q=unCStr("hardware fault"),_1R=unCStr("unsupported operation"),_1S=unCStr("timeout"),_1T=unCStr("resource vanished"),_1U=unCStr("interrupted"),_1V=unCStr("resource busy"),_1W=unCStr("resource exhausted"),_1X=unCStr("end of file"),_1Y=unCStr("illegal operation"),_1Z=unCStr("permission denied"),_20=unCStr("user error"),_21=unCStr("unsatisified constraints"),_22=unCStr("system error"),_23=function(_24,_25){switch(E(_24)){case 0:return _1G(_1K,_25);case 1:return _1G(_1L,_25);case 2:return _1G(_1V,_25);case 3:return _1G(_1W,_25);case 4:return _1G(_1X,_25);case 5:return _1G(_1Y,_25);case 6:return _1G(_1Z,_25);case 7:return _1G(_20,_25);case 8:return _1G(_21,_25);case 9:return _1G(_22,_25);case 10:return _1G(_1M,_25);case 11:return _1G(_1N,_25);case 12:return _1G(_1O,_25);case 13:return _1G(_1P,_25);case 14:return _1G(_1Q,_25);case 15:return _1G(_1R,_25);case 16:return _1G(_1S,_25);case 17:return _1G(_1T,_25);default:return _1G(_1U,_25);}},_26=[0,125],_27=unCStr("{handle: "),_28=function(_29,_2a,_2b,_2c,_2d,_2e){var _2f=new T(function(){var _2g=new T(function(){return _23(_2a,new T(function(){var _2h=E(_2c);return _2h[0]==0?E(_2e):_1G(_1F,new T(function(){return _1G(_2h,[1,_1E,_2e]);}));}));}),_2i=E(_2b);return _2i[0]==0?E(_2g):_1G(_2i,new T(function(){return _1G(_1D,_2g);}));}),_2j=E(_2d);if(!_2j[0]){var _2k=E(_29);if(!_2k[0]){return E(_2f);}else{var _2l=E(_2k[1]);return _2l[0]==0?_1G(_27,new T(function(){return _1G(_2l[1],[1,_26,new T(function(){return _1G(_1D,_2f);})]);})):_1G(_27,new T(function(){return _1G(_2l[1],[1,_26,new T(function(){return _1G(_1D,_2f);})]);}));}}else{return _1G(_2j[1],new T(function(){return _1G(_1D,_2f);}));}},_2m=function(_2n){var _2o=E(_2n);return _28(_2o[1],_2o[2],_2o[3],_2o[4],_2o[6],_g);},_2p=function(_2q,_2r){var _2s=E(_2q);return _28(_2s[1],_2s[2],_2s[3],_2s[4],_2s[6],_2r);},_2t=[0,44],_2u=[0,93],_2v=[0,91],_2w=function(_2x,_2y,_2z){var _2A=E(_2y);return _2A[0]==0?unAppCStr("[]",_2z):[1,_2v,new T(function(){return A(_2x,[_2A[1],new T(function(){var _2B=function(_2C){var _2D=E(_2C);return _2D[0]==0?E([1,_2u,_2z]):[1,_2t,new T(function(){return A(_2x,[_2D[1],new T(function(){return _2B(_2D[2]);})]);})];};return _2B(_2A[2]);})]);})];},_2E=function(_2F,_2G){return _2w(_2p,_2F,_2G);},_2H=function(_2I,_2J,_2K){var _2L=E(_2J);return _28(_2L[1],_2L[2],_2L[3],_2L[4],_2L[6],_2K);},_2M=[0,_2H,_2m,_2E],_2N=new T(function(){return [0,_1k,_2M,_2O,_1A];}),_2O=function(_2P){return [0,_2N,_2P];},_2Q=7,_2R=function(_2S){return [0,_9,_2Q,_g,_2S,_9,_9];},_2T=function(_2U,_){return die(new T(function(){return _2O(new T(function(){return _2R(_2U);}));}));},_2V=function(_2W,_){return _2T(_2W,_);},_2X=function(_2Y,_){return _2Y;},_2Z=[0,_1b,_18,_2X,_2V],_30=function(_31){return E(E(_31)[1]);},_32=function(_33,_34,_35,_36){return A(_30,[_33,new T(function(){return A(_34,[_36]);}),function(_37){return A(_35,[new T(function(){return E(E(_37)[1]);}),new T(function(){return E(E(_37)[2]);})]);}]);},_38=function(_39,_3a,_3b,_3c){return A(_30,[_39,new T(function(){return A(_3a,[_3c]);}),function(_3d){return A(_3b,[new T(function(){return E(E(_3d)[2]);})]);}]);},_3e=function(_3f,_3g,_3h,_3i){return _38(_3f,_3g,_3h,_3i);},_3j=function(_3k){return E(E(_3k)[4]);},_3l=function(_3m,_3n){var _3o=new T(function(){return A(_3j,[_3m,_3n]);});return function(_3p){return E(_3o);};},_3q=function(_3r){return E(E(_3r)[3]);},_3s=function(_3t){var _3u=new T(function(){return _3q(_3t);});return [0,function(_3g,_3h,_3i){return _32(_3t,_3g,_3h,_3i);},function(_3g,_3h,_3i){return _3e(_3t,_3g,_3h,_3i);},function(_3v,_3w){return A(_3u,[[0,_3v,_3w]]);},function(_3i){return _3l(_3t,_3i);}];},_3x=new T(function(){return _3s(_2Z);}),_3y=[0,112],_3z=function(_3A,_3B){var _3C=jsShowI(_3A);return _1G(fromJSStr(_3C),_3B);},_3D=[0,41],_3E=[0,40],_3F=function(_3G,_3H,_3I){return _3H>=0?_3z(_3H,_3I):_3G<=6?_3z(_3H,_3I):[1,_3E,new T(function(){var _3J=jsShowI(_3H);return _1G(fromJSStr(_3J),[1,_3D,_3I]);})];},_3K=function(_3L,_3M,_3N,_3O){var _3P=E(_3M);return A(_3P[1],[new T(function(){var _3Q=E(_3L);return E(_3N);}),function(_3R){var _3S=new T(function(){return E(E(_3R)[2]);});return A(_3P[2],[new T(function(){return A(_3O,[new T(function(){var _3T=E(new T(function(){var _3U=E(_3L);return [0,coercionToken];})),_3V=E(_3R);return [0,_3V[1],new T(function(){return [0,E(_3S)[1]+1|0];}),_3V[3],_3V[4],_3V[5],_3V[6]];})]);}),new T(function(){return A(_3P[3],[[1,_3y,new T(function(){return _1G(_3F(0,E(_3S)[1],_g),new T(function(){return E(E(_3R)[1]);}));})]]);})]);}]);},_3W=new T(function(){return _3K(_13,_3x,_11,_Y);}),_3X=unCStr("span"),_3Y=function(_3Z,_40,_){var _41=jsCreateElem(toJSStr(E(_3Z))),_42=jsAppendChild(_41,E(_40)[1]);return [0,_41];},_43=function(_X,_){return _3Y(_3X,_X,_);},_44=unCStr(" could be found!"),_45=function(_46){return err(unAppCStr("No element with ID ",new T(function(){return _1G(_46,_44);})));},_47=function(_48,_49,_){var _4a=E(_49),_4b=jsFind(toJSStr(_4a)),_4c=E(_4b);if(!_4c[0]){return _45(_4a);}else{var _4d=E(_4c[1]),_4e=jsClearChildren(_4d[1]);return _l(_48,_4d,_);}},_4f=function(_4g,_4h,_4i,_){var _4j=A(_3W,[_4i,_]),_4k=E(_4j),_4l=_4k[1],_4m=E(_4k[2]),_4n=_4m[2],_4o=E(_4m[4]),_4p=A(_4g,[[0,_4m[1],_4n,_4m[3],[0,function(_){return _47(function(_4q,_){var _4r=A(_4g,[new T(function(){var _4s=E(_4q);return [0,_4s[1],_4n,_4s[3],_4s[4],_4s[5],_4s[6]];}),_]);return [0,[0,_2X,E(E(_4r)[1])[2]],_4q];},_4l,_);},function(_4t,_){var _4u=_47(new T(function(){return A(_4h,[_4t]);}),_4l,_),_4v=E(_4u);return _4v[0]==0?_9:A(_4o[2],[_4v[1],_]);}],_4m[5],_4m[6]],_]),_4w=E(_4p),_4x=_4w[2],_4y=E(_4w[1]),_4z=_4y[1],_4A=new T(function(){return _Q(_43,[1,[0,_z,_4l],_g]);}),_4B=E(_4y[2]);if(!_4B[0]){return [0,[0,function(_4C,_){var _4D=A(_4z,[_4C,_]),_4E=A(_4A,[_4C,_]);return _4C;},_9],new T(function(){var _4F=E(_4x);return [0,_4F[1],_4F[2],_4F[3],_4o,_4F[5],_4F[6]];})];}else{var _4G=A(_4h,[_4B[1],new T(function(){var _4H=E(_4x);return [0,_4H[1],_4H[2],_4H[3],_4o,_4H[5],_4H[6]];}),_]),_4I=E(_4G),_4J=E(_4I[1]);return [0,[0,function(_4K,_){var _4L=A(_4z,[_4K,_]),_4M=A(_4A,[_4K,_]),_4N=A(_4J[1],[_4M,_]);return _4K;},_4J[2]],_4I[2]];}},_4O=function(_4P,_4Q,_){var _4R=jsCreateTextNode(toJSStr(E(_4P))),_4S=jsAppendChild(_4R,E(_4Q)[1]);return [0,_4R];},_4T=unCStr("This widget sum two numbers and append the result. Using applicative and monadic expressions"),_4U=[0,112],_4V=[1,_4U,_g],_4W=function(_4X,_4Y){var _4Z=new T(function(){return A(_4X,[_4Y]);});return function(_50,_){var _51=jsCreateElem(toJSStr(_4V)),_52=jsAppendChild(_51,E(_50)[1]),_53=[0,_51],_54=A(_4Z,[_53,_]);return _53;};},_55=new T(function(){return _4W(_4O,_4T);}),_56=function(_57){return _3F(0,E(_57)[1],_g);},_58=[0,98],_59=[1,_58,_g],_5a=function(_5b,_5c){var _5d=new T(function(){return A(_5b,[_5c]);});return function(_5e,_){var _5f=jsCreateElem(toJSStr(_59)),_5g=jsAppendChild(_5f,E(_5e)[1]),_5h=[0,_5f],_5i=A(_5d,[_5h,_]);return _5h;};},_5j=[1,_A],_5k=unCStr("result: "),_5l=function(_5m){return E(_5m);},_5n=function(_5o){return function(_5p,_){return [0,[0,new T(function(){var _5q=new T(function(){return _5a(_4O,new T(function(){return _56(_5o);}));});return _4W(_5l,function(_5r,_){var _5s=_4O(_5k,_5r,_),_5t=A(_5q,[_5r,_]);return _5r;});}),_5j],_5p];};},_5u=function(_5v,_5w){return [0,E(_5v)[1]+E(_5w)[1]|0];},_5x=unCStr("br"),_5y=function(_5z,_){var _5A=jsCreateElem(toJSStr(E(_5x))),_5B=jsAppendChild(_5A,E(_5z)[1]);return [0,_5A];},_5C=unCStr("first number"),_5D=[13,coercionToken],_5E=unCStr("text"),_5F=function(_5G,_5H,_5I,_){var _5J=_3Y(_5G,_5I,_),_5K=A(_5H,[_5J,_]);return _5J;},_5L=unCStr("()"),_5M=unCStr("GHC.Tuple"),_5N=unCStr("ghc-prim"),_5O=[0,I_fromBits([2170319554,3688774321]),I_fromBits([26914641,3196943984]),_5N,_5M,_5L],_5P=[0,I_fromBits([2170319554,3688774321]),I_fromBits([26914641,3196943984]),_5O,_g],_5Q=function(_5R){return E(_5P);},_5S=unCStr("haste-perch-0.1.0.1"),_5T=unCStr("Haste.Perch"),_5U=unCStr("PerchM"),_5V=[0,I_fromBits([2701112155,1279447594]),I_fromBits([4004215588,1086752342]),_5S,_5T,_5U],_5W=[0,I_fromBits([2701112155,1279447594]),I_fromBits([4004215588,1086752342]),_5V,_g],_5X=function(_5Y){return E(_5W);},_5Z=function(_60){var _61=E(_60);return _61[0]==0?[0]:_1G(_61[1],new T(function(){return _5Z(_61[2]);}));},_62=function(_63,_64){var _65=E(_63);if(!_65){return [0,_g,_64];}else{var _66=E(_64);if(!_66[0]){return [0,_g,_g];}else{var _67=new T(function(){var _68=_62(_65-1|0,_66[2]);return [0,_68[1],_68[2]];});return [0,[1,_66[1],new T(function(){return E(E(_67)[1]);})],new T(function(){return E(E(_67)[2]);})];}}},_69=[0,120],_6a=[0,48],_6b=function(_6c){var _6d=new T(function(){var _6e=_62(8,new T(function(){var _6f=md5(toJSStr(E(_6c)));return fromJSStr(_6f);}));return [0,_6e[1],_6e[2]];}),_6g=parseInt([0,toJSStr([1,_6a,[1,_69,new T(function(){return E(E(_6d)[1]);})]])]),_6h=new T(function(){var _6i=_62(8,new T(function(){return E(E(_6d)[2]);}));return [0,_6i[1],_6i[2]];}),_6j=parseInt([0,toJSStr([1,_6a,[1,_69,new T(function(){return E(E(_6h)[1]);})]])]),_6k=hs_mkWord64(_6g,_6j),_6l=parseInt([0,toJSStr([1,_6a,[1,_69,new T(function(){return E(_62(8,new T(function(){return E(E(_6h)[2]);}))[1]);})]])]),_6m=hs_mkWord64(_6l,_6l);return [0,_6k,_6m];},_6n=function(_6o,_6p){var _6q=E(_6p);return _6q[0]==0?[0]:[1,new T(function(){return A(_6o,[_6q[1]]);}),new T(function(){return _6n(_6o,_6q[2]);})];},_6r=function(_6s,_6t){var _6u=jsShowI(_6s),_6v=md5(_6u);return _1G(fromJSStr(_6v),new T(function(){var _6w=jsShowI(_6t),_6x=md5(_6w);return fromJSStr(_6x);}));},_6y=function(_6z){var _6A=E(_6z);return _6r(_6A[1],_6A[2]);},_6B=function(_6C){var _6D=E(_6C);if(!_6D[0]){return [0];}else{var _6E=E(_6D[1]);return [1,[0,_6E[1],_6E[2]],new T(function(){return _6B(_6D[2]);})];}},_6F=unCStr("Prelude.undefined"),_6G=new T(function(){return err(_6F);}),_6H=function(_6I,_6J){return function(_6K){return E(new T(function(){var _6L=A(_6I,[_6G]),_6M=E(_6L[3]),_6N=_6M[1],_6O=_6M[2],_6P=_1G(_6L[4],[1,new T(function(){return A(_6J,[_6G]);}),_g]);if(!_6P[0]){return [0,_6N,_6O,_6M,_g];}else{var _6Q=_6b(new T(function(){return _5Z(_6n(_6y,[1,[0,_6N,_6O],new T(function(){return _6B(_6P);})]));}));return [0,_6Q[1],_6Q[2],_6M,_6P];}}));};},_6R=new T(function(){return _6H(_5X,_5Q);}),_6S=unCStr("value"),_6T=unCStr("onclick"),_6U=unCStr("checked"),_6V=[0,_6U,_g],_6W=[1,_6V,_g],_6X=unCStr("type"),_6Y=unCStr("input"),_6Z=function(_70,_){return _3Y(_6Y,_70,_);},_71=function(_72,_73,_74,_75,_76){var _77=new T(function(){var _78=new T(function(){return _Q(_6Z,[1,[0,_6X,_73],[1,[0,_z,_72],[1,[0,_6S,_74],_g]]]);});return !E(_75)?E(_78):_Q(_78,_6W);}),_79=E(_76);return _79[0]==0?E(_77):_Q(_77,[1,[0,_6T,_79[1]],_g]);},_7a=unCStr("href"),_7b=[0,97],_7c=[1,_7b,_g],_7d=function(_7e,_){return _3Y(_7c,_7e,_);},_7f=function(_7g,_7h){var _7i=new T(function(){return _Q(_7d,[1,[0,_7a,_7g],_g]);});return function(_7j,_){var _7k=A(_7i,[_7j,_]),_7l=A(_7h,[_7k,_]);return _7k;};},_7m=function(_7n){return _7f(_7n,function(_X,_){return _4O(_7n,_X,_);});},_7o=unCStr("option"),_7p=function(_7q,_){return _3Y(_7o,_7q,_);},_7r=unCStr("selected"),_7s=[0,_7r,_g],_7t=[1,_7s,_g],_7u=function(_7v,_7w,_7x){var _7y=new T(function(){return _Q(_7p,[1,[0,_6S,_7v],_g]);}),_7z=function(_7A,_){var _7B=A(_7y,[_7A,_]),_7C=A(_7w,[_7B,_]);return _7B;};return !E(_7x)?E(_7z):_Q(_7z,_7t);},_7D=function(_7E,_7F){return _7u(_7E,function(_X,_){return _4O(_7E,_X,_);},_7F);},_7G=unCStr("method"),_7H=unCStr("action"),_7I=unCStr("UTF-8"),_7J=unCStr("acceptCharset"),_7K=[0,_7J,_7I],_7L=unCStr("form"),_7M=function(_7N,_){return _3Y(_7L,_7N,_);},_7O=function(_7P,_7Q,_7R){var _7S=new T(function(){return _Q(_7M,[1,_7K,[1,[0,_7H,_7P],[1,[0,_7G,_7Q],_g]]]);});return function(_7T,_){var _7U=A(_7S,[_7T,_]),_7V=A(_7R,[_7U,_]);return _7U;};},_7W=unCStr("select"),_7X=function(_7Y,_){return _3Y(_7W,_7Y,_);},_7Z=function(_80,_81){var _82=new T(function(){return _Q(_7X,[1,[0,_z,_80],_g]);});return function(_83,_){var _84=A(_82,[_83,_]),_85=A(_81,[_84,_]);return _84;};},_86=unCStr("textarea"),_87=function(_88,_){return _3Y(_86,_88,_);},_89=function(_8a,_8b){var _8c=new T(function(){return _Q(_87,[1,[0,_z,_8a],_g]);});return function(_8d,_){var _8e=A(_8c,[_8d,_]),_8f=_4O(_8b,_8e,_);return _8e;};},_8g=unCStr("color:red"),_8h=unCStr("style"),_8i=[0,_8h,_8g],_8j=[1,_8i,_g],_8k=[0,98],_8l=[1,_8k,_g],_8m=function(_8n){return _Q(function(_8o,_){var _8p=_3Y(_8l,_8o,_),_8q=A(_8n,[_8p,_]);return _8p;},_8j);},_8r=function(_8s,_8t,_){var _8u=E(_8s);if(!_8u[0]){return _8t;}else{var _8v=A(_8u[1],[_8t,_]),_8w=_8r(_8u[2],_8t,_);return _8t;}},_8x=function(_8y,_8z,_8A,_){var _8B=A(_8y,[_8A,_]),_8C=A(_8z,[_8A,_]);return _8A;},_8D=[0,_2X,_8x,_8r],_8E=[0,_8D,_6R,_4O,_4O,_5F,_8m,_7f,_7m,_71,_89,_7Z,_7u,_7D,_7O,_Q],_8F=[0,_2Z,_H],_8G=unCStr("base"),_8H=unCStr("Control.Exception.Base"),_8I=unCStr("PatternMatchFail"),_8J=[0,I_fromBits([18445595,3739165398]),I_fromBits([52003073,3246954884]),_8G,_8H,_8I],_8K=[0,I_fromBits([18445595,3739165398]),I_fromBits([52003073,3246954884]),_8J,_g],_8L=function(_8M){return E(_8K);},_8N=function(_8O){var _8P=E(_8O);return _1q(_1m(_8P[1]),_8L,_8P[2]);},_8Q=function(_8R){return E(E(_8R)[1]);},_8S=function(_8T,_8U){return _1G(E(_8T)[1],_8U);},_8V=function(_8W,_8X){return _2w(_8S,_8W,_8X);},_8Y=function(_8Z,_90,_91){return _1G(E(_90)[1],_91);},_92=[0,_8Y,_8Q,_8V],_93=new T(function(){return [0,_8L,_92,_94,_8N];}),_94=function(_95){return [0,_93,_95];},_96=unCStr("Non-exhaustive patterns in"),_97=function(_98,_99){return die(new T(function(){return A(_99,[_98]);}));},_9a=function(_9b,_9c){var _9d=E(_9c);if(!_9d[0]){return [0,_g,_g];}else{var _9e=_9d[1];if(!A(_9b,[_9e])){return [0,_g,_9d];}else{var _9f=new T(function(){var _9g=_9a(_9b,_9d[2]);return [0,_9g[1],_9g[2]];});return [0,[1,_9e,new T(function(){return E(E(_9f)[1]);})],new T(function(){return E(E(_9f)[2]);})];}}},_9h=[0,32],_9i=[0,10],_9j=[1,_9i,_g],_9k=function(_9l){return E(E(_9l)[1])==124?false:true;},_9m=function(_9n,_9o){var _9p=_9a(_9k,unCStr(_9n)),_9q=_9p[1],_9r=function(_9s,_9t){return _1G(_9s,new T(function(){return unAppCStr(": ",new T(function(){return _1G(_9o,new T(function(){return _1G(_9t,_9j);}));}));}));},_9u=E(_9p[2]);return _9u[0]==0?_9r(_9q,_g):E(E(_9u[1])[1])==124?_9r(_9q,[1,_9h,_9u[2]]):_9r(_9q,_g);},_9v=function(_9w){return _97([0,new T(function(){return _9m(_9w,_96);})],_94);},_9x=new T(function(){return _9v("Text\\ParserCombinators\\ReadP.hs:(134,3)-(157,60)|function mplus");}),_9y=function(_9z,_9A){while(1){var _9B=(function(_9C,_9D){var _9E=E(_9C);switch(_9E[0]){case 0:var _9F=E(_9D);if(!_9F[0]){return [0];}else{_9z=A(_9E[1],[_9F[1]]);_9A=_9F[2];return null;}break;case 1:var _9G=A(_9E[1],[_9D]),_9H=_9D;_9z=_9G;_9A=_9H;return null;case 2:return [0];case 3:return [1,[0,_9E[1],_9D],new T(function(){return _9y(_9E[2],_9D);})];default:return E(_9E[1]);}})(_9z,_9A);if(_9B!=null){return _9B;}}},_9I=function(_9J,_9K){var _9L=new T(function(){var _9M=E(_9K);if(_9M[0]==3){return [3,_9M[1],new T(function(){return _9I(_9J,_9M[2]);})];}else{var _9N=E(_9J);if(_9N[0]==2){return E(_9M);}else{var _9O=E(_9M);if(_9O[0]==2){return E(_9N);}else{var _9P=new T(function(){var _9Q=E(_9O);if(_9Q[0]==4){return [1,function(_9R){return [4,new T(function(){return _1G(_9y(_9N,_9R),_9Q[1]);})];}];}else{var _9S=E(_9N);if(_9S[0]==1){var _9T=_9S[1],_9U=E(_9Q);return _9U[0]==0?[1,function(_9V){return _9I(A(_9T,[_9V]),_9U);}]:[1,function(_9W){return _9I(A(_9T,[_9W]),new T(function(){return A(_9U[1],[_9W]);}));}];}else{var _9X=E(_9Q);return _9X[0]==0?E(_9x):[1,function(_9Y){return _9I(_9S,new T(function(){return A(_9X[1],[_9Y]);}));}];}}}),_9Z=E(_9N);switch(_9Z[0]){case 1:var _a0=E(_9O);return _a0[0]==4?[1,function(_a1){return [4,new T(function(){return _1G(_9y(A(_9Z[1],[_a1]),_a1),_a0[1]);})];}]:E(_9P);case 4:var _a2=_9Z[1],_a3=E(_9O);switch(_a3[0]){case 0:return [1,function(_a4){return [4,new T(function(){return _1G(_a2,new T(function(){return _9y(_a3,_a4);}));})];}];case 1:return [1,function(_a5){return [4,new T(function(){return _1G(_a2,new T(function(){return _9y(A(_a3[1],[_a5]),_a5);}));})];}];default:return [4,new T(function(){return _1G(_a2,_a3[1]);})];}break;default:return E(_9P);}}}}}),_a6=E(_9J);switch(_a6[0]){case 0:var _a7=E(_9K);return _a7[0]==0?[0,function(_a8){return _9I(A(_a6[1],[_a8]),new T(function(){return A(_a7[1],[_a8]);}));}]:E(_9L);case 3:return [3,_a6[1],new T(function(){return _9I(_a6[2],_9K);})];default:return E(_9L);}},_a9=function(_aa,_ab){return E(_aa)[1]!=E(_ab)[1];},_ac=function(_ad,_ae){return E(_ad)[1]==E(_ae)[1];},_af=[0,_ac,_a9],_ag=function(_ah){return E(E(_ah)[1]);},_ai=function(_aj,_ak,_al){while(1){var _am=E(_ak);if(!_am[0]){return E(_al)[0]==0?true:false;}else{var _an=E(_al);if(!_an[0]){return false;}else{if(!A(_ag,[_aj,_am[1],_an[1]])){return false;}else{_ak=_am[2];_al=_an[2];continue;}}}}},_ao=function(_ap,_aq,_ar){return !_ai(_ap,_aq,_ar)?true:false;},_as=function(_at){return [0,function(_au,_av){return _ai(_at,_au,_av);},function(_au,_av){return _ao(_at,_au,_av);}];},_aw=new T(function(){return _as(_af);}),_ax=function(_ay,_az){var _aA=E(_ay);switch(_aA[0]){case 0:return [0,function(_aB){return _ax(A(_aA[1],[_aB]),_az);}];case 1:return [1,function(_aC){return _ax(A(_aA[1],[_aC]),_az);}];case 2:return [2];case 3:return _9I(A(_az,[_aA[1]]),new T(function(){return _ax(_aA[2],_az);}));default:var _aD=function(_aE){var _aF=E(_aE);if(!_aF[0]){return [0];}else{var _aG=E(_aF[1]);return _1G(_9y(A(_az,[_aG[1]]),_aG[2]),new T(function(){return _aD(_aF[2]);}));}},_aH=_aD(_aA[1]);return _aH[0]==0?[2]:[4,_aH];}},_aI=[2],_aJ=function(_aK){return [3,_aK,_aI];},_aL=function(_aM,_aN){var _aO=E(_aM);if(!_aO){return A(_aN,[_A]);}else{var _aP=new T(function(){return _aL(_aO-1|0,_aN);});return [0,function(_aQ){return E(_aP);}];}},_aR=function(_aS,_aT,_aU){var _aV=new T(function(){return A(_aS,[_aJ]);});return [1,function(_aW){return A(function(_aX,_aY,_aZ){while(1){var _b0=(function(_b1,_b2,_b3){var _b4=E(_b1);switch(_b4[0]){case 0:var _b5=E(_b2);if(!_b5[0]){return E(_aT);}else{_aX=A(_b4[1],[_b5[1]]);_aY=_b5[2];var _b6=_b3+1|0;_aZ=_b6;return null;}break;case 1:var _b7=A(_b4[1],[_b2]),_b8=_b2,_b6=_b3;_aX=_b7;_aY=_b8;_aZ=_b6;return null;case 2:return E(_aT);case 3:return function(_b9){var _ba=new T(function(){return _ax(_b4,_b9);});return _aL(_b3,function(_bb){return E(_ba);});};default:return function(_bc){return _ax(_b4,_bc);};}})(_aX,_aY,_aZ);if(_b0!=null){return _b0;}}},[_aV,_aW,0,_aU]);}];},_bd=[6],_be=unCStr("valDig: Bad base"),_bf=new T(function(){return err(_be);}),_bg=function(_bh,_bi){var _bj=function(_bk,_bl){var _bm=E(_bk);if(!_bm[0]){var _bn=new T(function(){return A(_bl,[_g]);});return function(_bo){return A(_bo,[_bn]);};}else{var _bp=E(_bm[1])[1],_bq=function(_br){var _bs=new T(function(){return _bj(_bm[2],function(_bt){return A(_bl,[[1,_br,_bt]]);});});return function(_bu){var _bv=new T(function(){return A(_bs,[_bu]);});return [0,function(_bw){return E(_bv);}];};};switch(E(E(_bh)[1])){case 8:if(48>_bp){var _bx=new T(function(){return A(_bl,[_g]);});return function(_by){return A(_by,[_bx]);};}else{if(_bp>55){var _bz=new T(function(){return A(_bl,[_g]);});return function(_bA){return A(_bA,[_bz]);};}else{return _bq([0,_bp-48|0]);}}break;case 10:if(48>_bp){var _bB=new T(function(){return A(_bl,[_g]);});return function(_bC){return A(_bC,[_bB]);};}else{if(_bp>57){var _bD=new T(function(){return A(_bl,[_g]);});return function(_bE){return A(_bE,[_bD]);};}else{return _bq([0,_bp-48|0]);}}break;case 16:var _bF=new T(function(){return 97>_bp?65>_bp?[0]:_bp>70?[0]:[1,[0,(_bp-65|0)+10|0]]:_bp>102?65>_bp?[0]:_bp>70?[0]:[1,[0,(_bp-65|0)+10|0]]:[1,[0,(_bp-97|0)+10|0]];});if(48>_bp){var _bG=E(_bF);if(!_bG[0]){var _bH=new T(function(){return A(_bl,[_g]);});return function(_bI){return A(_bI,[_bH]);};}else{return _bq(_bG[1]);}}else{if(_bp>57){var _bJ=E(_bF);if(!_bJ[0]){var _bK=new T(function(){return A(_bl,[_g]);});return function(_bL){return A(_bL,[_bK]);};}else{return _bq(_bJ[1]);}}else{return _bq([0,_bp-48|0]);}}break;default:return E(_bf);}}};return [1,function(_bM){return A(_bj,[_bM,_H,function(_bN){var _bO=E(_bN);return _bO[0]==0?[2]:A(_bi,[_bO]);}]);}];},_bP=[0,10],_bQ=[0,1],_bR=[0,2147483647],_bS=function(_bT,_bU){while(1){var _bV=E(_bT);if(!_bV[0]){var _bW=_bV[1],_bX=E(_bU);if(!_bX[0]){var _bY=_bX[1],_bZ=addC(_bW,_bY);if(!E(_bZ[2])){return [0,_bZ[1]];}else{_bT=[1,I_fromInt(_bW)];_bU=[1,I_fromInt(_bY)];continue;}}else{_bT=[1,I_fromInt(_bW)];_bU=_bX;continue;}}else{var _c0=E(_bU);if(!_c0[0]){_bT=_bV;_bU=[1,I_fromInt(_c0[1])];continue;}else{return [1,I_add(_bV[1],_c0[1])];}}}},_c1=new T(function(){return _bS(_bR,_bQ);}),_c2=function(_c3){var _c4=E(_c3);if(!_c4[0]){var _c5=E(_c4[1]);return _c5==(-2147483648)?E(_c1):[0, -_c5];}else{return [1,I_negate(_c4[1])];}},_c6=[0,10],_c7=[0,0],_c8=function(_c9,_ca){while(1){var _cb=E(_c9);if(!_cb[0]){var _cc=_cb[1],_cd=E(_ca);if(!_cd[0]){var _ce=_cd[1];if(!(imul(_cc,_ce)|0)){return [0,imul(_cc,_ce)|0];}else{_c9=[1,I_fromInt(_cc)];_ca=[1,I_fromInt(_ce)];continue;}}else{_c9=[1,I_fromInt(_cc)];_ca=_cd;continue;}}else{var _cf=E(_ca);if(!_cf[0]){_c9=_cb;_ca=[1,I_fromInt(_cf[1])];continue;}else{return [1,I_mul(_cb[1],_cf[1])];}}}},_cg=function(_ch,_ci,_cj){while(1){var _ck=E(_cj);if(!_ck[0]){return E(_ci);}else{var _cl=_bS(_c8(_ci,_ch),_ck[1]);_cj=_ck[2];_ci=_cl;continue;}}},_cm=function(_cn){var _co=new T(function(){return _9I(_9I([0,function(_cp){return E(E(_cp)[1])==45?_bg(_bP,function(_cq){return A(_cn,[[1,new T(function(){return _c2(_cg(_c6,_c7,_cq));})]]);}):[2];}],[0,function(_cr){return E(E(_cr)[1])==43?_bg(_bP,function(_cs){return A(_cn,[[1,new T(function(){return _cg(_c6,_c7,_cs);})]]);}):[2];}]),new T(function(){return _bg(_bP,function(_ct){return A(_cn,[[1,new T(function(){return _cg(_c6,_c7,_ct);})]]);});}));});return _9I([0,function(_cu){return E(E(_cu)[1])==101?E(_co):[2];}],[0,function(_cv){return E(E(_cv)[1])==69?E(_co):[2];}]);},_cw=function(_cx){return A(_cx,[_9]);},_cy=function(_cz){return A(_cz,[_9]);},_cA=function(_cB){var _cC=new T(function(){return _bg(_bP,function(_cD){return A(_cB,[[1,_cD]]);});});return [0,function(_cE){return E(E(_cE)[1])==46?E(_cC):[2];}];},_cF=function(_cG){return _bg(_bP,function(_cH){return _aR(_cA,_cw,function(_cI){return _aR(_cm,_cy,function(_cJ){return A(_cG,[[5,[1,_cH,_cI,_cJ]]]);});});});},_cK=function(_cL,_cM,_cN){while(1){var _cO=E(_cN);if(!_cO[0]){return false;}else{if(!A(_ag,[_cL,_cM,_cO[1]])){_cN=_cO[2];continue;}else{return true;}}}},_cP=unCStr("!@#$%&*+./<=>?\\^|:-~"),_cQ=function(_cR){return _cK(_af,_cR,_cP);},_cS=[0,8],_cT=[0,16],_cU=function(_cV){var _cW=new T(function(){return _bg(_cT,function(_cX){return A(_cV,[[5,[0,_cT,_cX]]]);});}),_cY=new T(function(){return _bg(_cS,function(_cZ){return A(_cV,[[5,[0,_cS,_cZ]]]);});}),_d0=new T(function(){return _bg(_cT,function(_d1){return A(_cV,[[5,[0,_cT,_d1]]]);});}),_d2=new T(function(){return _bg(_cS,function(_d3){return A(_cV,[[5,[0,_cS,_d3]]]);});});return [0,function(_d4){return E(E(_d4)[1])==48?E([0,function(_d5){switch(E(E(_d5)[1])){case 79:return E(_d2);case 88:return E(_d0);case 111:return E(_cY);case 120:return E(_cW);default:return [2];}}]):[2];}];},_d6=true,_d7=function(_d8){var _d9=new T(function(){return A(_d8,[_cT]);}),_da=new T(function(){return A(_d8,[_cS]);}),_db=new T(function(){return A(_d8,[_cT]);}),_dc=new T(function(){return A(_d8,[_cS]);});return [0,function(_dd){switch(E(E(_dd)[1])){case 79:return E(_dc);case 88:return E(_db);case 111:return E(_da);case 120:return E(_d9);default:return [2];}}];},_de=function(_df){return A(_df,[_bP]);},_dg=function(_dh){return err(unAppCStr("Prelude.chr: bad argument: ",new T(function(){return _3F(9,_dh,_g);})));},_di=function(_dj){var _dk=E(_dj);return _dk[0]==0?E(_dk[1]):I_toInt(_dk[1]);},_dl=function(_dm,_dn){var _do=E(_dm);if(!_do[0]){var _dp=_do[1],_dq=E(_dn);return _dq[0]==0?_dp<=_dq[1]:I_compareInt(_dq[1],_dp)>=0;}else{var _dr=_do[1],_ds=E(_dn);return _ds[0]==0?I_compareInt(_dr,_ds[1])<=0:I_compare(_dr,_ds[1])<=0;}},_dt=function(_du){return [2];},_dv=function(_dw){var _dx=E(_dw);if(!_dx[0]){return E(_dt);}else{var _dy=_dx[1],_dz=E(_dx[2]);if(!_dz[0]){return E(_dy);}else{var _dA=new T(function(){return _dv(_dz);});return function(_dB){return _9I(A(_dy,[_dB]),new T(function(){return A(_dA,[_dB]);}));};}}},_dC=unCStr("NUL"),_dD=function(_dE){return [2];},_dF=function(_dG){return _dD(_dG);},_dH=function(_dI,_dJ){var _dK=function(_dL,_dM){var _dN=E(_dL);if(!_dN[0]){return function(_dO){return A(_dO,[_dI]);};}else{var _dP=E(_dM);if(!_dP[0]){return E(_dD);}else{if(E(_dN[1])[1]!=E(_dP[1])[1]){return E(_dF);}else{var _dQ=new T(function(){return _dK(_dN[2],_dP[2]);});return function(_dR){var _dS=new T(function(){return A(_dQ,[_dR]);});return [0,function(_dT){return E(_dS);}];};}}}};return [1,function(_dU){return A(_dK,[_dI,_dU,_dJ]);}];},_dV=[0,0],_dW=function(_dX){var _dY=new T(function(){return A(_dX,[_dV]);});return _dH(_dC,function(_dZ){return E(_dY);});},_e0=unCStr("STX"),_e1=[0,2],_e2=function(_e3){var _e4=new T(function(){return A(_e3,[_e1]);});return _dH(_e0,function(_e5){return E(_e4);});},_e6=unCStr("ETX"),_e7=[0,3],_e8=function(_e9){var _ea=new T(function(){return A(_e9,[_e7]);});return _dH(_e6,function(_eb){return E(_ea);});},_ec=unCStr("EOT"),_ed=[0,4],_ee=function(_ef){var _eg=new T(function(){return A(_ef,[_ed]);});return _dH(_ec,function(_eh){return E(_eg);});},_ei=unCStr("ENQ"),_ej=[0,5],_ek=function(_el){var _em=new T(function(){return A(_el,[_ej]);});return _dH(_ei,function(_en){return E(_em);});},_eo=unCStr("ACK"),_ep=[0,6],_eq=function(_er){var _es=new T(function(){return A(_er,[_ep]);});return _dH(_eo,function(_et){return E(_es);});},_eu=unCStr("BEL"),_ev=[0,7],_ew=function(_ex){var _ey=new T(function(){return A(_ex,[_ev]);});return _dH(_eu,function(_ez){return E(_ey);});},_eA=unCStr("BS"),_eB=[0,8],_eC=function(_eD){var _eE=new T(function(){return A(_eD,[_eB]);});return _dH(_eA,function(_eF){return E(_eE);});},_eG=unCStr("HT"),_eH=[0,9],_eI=function(_eJ){var _eK=new T(function(){return A(_eJ,[_eH]);});return _dH(_eG,function(_eL){return E(_eK);});},_eM=unCStr("LF"),_eN=[0,10],_eO=function(_eP){var _eQ=new T(function(){return A(_eP,[_eN]);});return _dH(_eM,function(_eR){return E(_eQ);});},_eS=unCStr("VT"),_eT=[0,11],_eU=function(_eV){var _eW=new T(function(){return A(_eV,[_eT]);});return _dH(_eS,function(_eX){return E(_eW);});},_eY=unCStr("FF"),_eZ=[0,12],_f0=function(_f1){var _f2=new T(function(){return A(_f1,[_eZ]);});return _dH(_eY,function(_f3){return E(_f2);});},_f4=unCStr("CR"),_f5=[0,13],_f6=function(_f7){var _f8=new T(function(){return A(_f7,[_f5]);});return _dH(_f4,function(_f9){return E(_f8);});},_fa=unCStr("SI"),_fb=[0,15],_fc=function(_fd){var _fe=new T(function(){return A(_fd,[_fb]);});return _dH(_fa,function(_ff){return E(_fe);});},_fg=unCStr("DLE"),_fh=[0,16],_fi=function(_fj){var _fk=new T(function(){return A(_fj,[_fh]);});return _dH(_fg,function(_fl){return E(_fk);});},_fm=unCStr("DC1"),_fn=[0,17],_fo=function(_fp){var _fq=new T(function(){return A(_fp,[_fn]);});return _dH(_fm,function(_fr){return E(_fq);});},_fs=unCStr("DC2"),_ft=[0,18],_fu=function(_fv){var _fw=new T(function(){return A(_fv,[_ft]);});return _dH(_fs,function(_fx){return E(_fw);});},_fy=unCStr("DC3"),_fz=[0,19],_fA=function(_fB){var _fC=new T(function(){return A(_fB,[_fz]);});return _dH(_fy,function(_fD){return E(_fC);});},_fE=unCStr("DC4"),_fF=[0,20],_fG=function(_fH){var _fI=new T(function(){return A(_fH,[_fF]);});return _dH(_fE,function(_fJ){return E(_fI);});},_fK=unCStr("NAK"),_fL=[0,21],_fM=function(_fN){var _fO=new T(function(){return A(_fN,[_fL]);});return _dH(_fK,function(_fP){return E(_fO);});},_fQ=unCStr("SYN"),_fR=[0,22],_fS=function(_fT){var _fU=new T(function(){return A(_fT,[_fR]);});return _dH(_fQ,function(_fV){return E(_fU);});},_fW=unCStr("ETB"),_fX=[0,23],_fY=function(_fZ){var _g0=new T(function(){return A(_fZ,[_fX]);});return _dH(_fW,function(_g1){return E(_g0);});},_g2=unCStr("CAN"),_g3=[0,24],_g4=function(_g5){var _g6=new T(function(){return A(_g5,[_g3]);});return _dH(_g2,function(_g7){return E(_g6);});},_g8=unCStr("EM"),_g9=[0,25],_ga=function(_gb){var _gc=new T(function(){return A(_gb,[_g9]);});return _dH(_g8,function(_gd){return E(_gc);});},_ge=unCStr("SUB"),_gf=[0,26],_gg=function(_gh){var _gi=new T(function(){return A(_gh,[_gf]);});return _dH(_ge,function(_gj){return E(_gi);});},_gk=unCStr("ESC"),_gl=[0,27],_gm=function(_gn){var _go=new T(function(){return A(_gn,[_gl]);});return _dH(_gk,function(_gp){return E(_go);});},_gq=unCStr("FS"),_gr=[0,28],_gs=function(_gt){var _gu=new T(function(){return A(_gt,[_gr]);});return _dH(_gq,function(_gv){return E(_gu);});},_gw=unCStr("GS"),_gx=[0,29],_gy=function(_gz){var _gA=new T(function(){return A(_gz,[_gx]);});return _dH(_gw,function(_gB){return E(_gA);});},_gC=unCStr("RS"),_gD=[0,30],_gE=function(_gF){var _gG=new T(function(){return A(_gF,[_gD]);});return _dH(_gC,function(_gH){return E(_gG);});},_gI=unCStr("US"),_gJ=[0,31],_gK=function(_gL){var _gM=new T(function(){return A(_gL,[_gJ]);});return _dH(_gI,function(_gN){return E(_gM);});},_gO=unCStr("SP"),_gP=[0,32],_gQ=function(_gR){var _gS=new T(function(){return A(_gR,[_gP]);});return _dH(_gO,function(_gT){return E(_gS);});},_gU=unCStr("DEL"),_gV=[0,127],_gW=function(_gX){var _gY=new T(function(){return A(_gX,[_gV]);});return _dH(_gU,function(_gZ){return E(_gY);});},_h0=[1,_gW,_g],_h1=[1,_gQ,_h0],_h2=[1,_gK,_h1],_h3=[1,_gE,_h2],_h4=[1,_gy,_h3],_h5=[1,_gs,_h4],_h6=[1,_gm,_h5],_h7=[1,_gg,_h6],_h8=[1,_ga,_h7],_h9=[1,_g4,_h8],_ha=[1,_fY,_h9],_hb=[1,_fS,_ha],_hc=[1,_fM,_hb],_hd=[1,_fG,_hc],_he=[1,_fA,_hd],_hf=[1,_fu,_he],_hg=[1,_fo,_hf],_hh=[1,_fi,_hg],_hi=[1,_fc,_hh],_hj=[1,_f6,_hi],_hk=[1,_f0,_hj],_hl=[1,_eU,_hk],_hm=[1,_eO,_hl],_hn=[1,_eI,_hm],_ho=[1,_eC,_hn],_hp=[1,_ew,_ho],_hq=[1,_eq,_hp],_hr=[1,_ek,_hq],_hs=[1,_ee,_hr],_ht=[1,_e8,_hs],_hu=[1,_e2,_ht],_hv=[1,_dW,_hu],_hw=unCStr("SOH"),_hx=[0,1],_hy=function(_hz){var _hA=new T(function(){return A(_hz,[_hx]);});return _dH(_hw,function(_hB){return E(_hA);});},_hC=unCStr("SO"),_hD=[0,14],_hE=function(_hF){var _hG=new T(function(){return A(_hF,[_hD]);});return _dH(_hC,function(_hH){return E(_hG);});},_hI=function(_hJ){return _aR(_hy,_hE,_hJ);},_hK=[1,_hI,_hv],_hL=new T(function(){return _dv(_hK);}),_hM=[0,1114111],_hN=[0,34],_hO=[0,_hN,_d6],_hP=[0,39],_hQ=[0,_hP,_d6],_hR=[0,92],_hS=[0,_hR,_d6],_hT=[0,_ev,_d6],_hU=[0,_eB,_d6],_hV=[0,_eZ,_d6],_hW=[0,_eN,_d6],_hX=[0,_f5,_d6],_hY=[0,_eH,_d6],_hZ=[0,_eT,_d6],_i0=[0,_dV,_d6],_i1=[0,_hx,_d6],_i2=[0,_e1,_d6],_i3=[0,_e7,_d6],_i4=[0,_ed,_d6],_i5=[0,_ej,_d6],_i6=[0,_ep,_d6],_i7=[0,_ev,_d6],_i8=[0,_eB,_d6],_i9=[0,_eH,_d6],_ia=[0,_eN,_d6],_ib=[0,_eT,_d6],_ic=[0,_eZ,_d6],_id=[0,_f5,_d6],_ie=[0,_hD,_d6],_if=[0,_fb,_d6],_ig=[0,_fh,_d6],_ih=[0,_fn,_d6],_ii=[0,_ft,_d6],_ij=[0,_fz,_d6],_ik=[0,_fF,_d6],_il=[0,_fL,_d6],_im=[0,_fR,_d6],_in=[0,_fX,_d6],_io=[0,_g3,_d6],_ip=[0,_g9,_d6],_iq=[0,_gf,_d6],_ir=[0,_gl,_d6],_is=[0,_gr,_d6],_it=[0,_gx,_d6],_iu=[0,_gD,_d6],_iv=[0,_gJ,_d6],_iw=function(_ix){return [0,_ix];},_iy=function(_iz){var _iA=new T(function(){return A(_iz,[_hZ]);}),_iB=new T(function(){return A(_iz,[_hY]);}),_iC=new T(function(){return A(_iz,[_hX]);}),_iD=new T(function(){return A(_iz,[_hW]);}),_iE=new T(function(){return A(_iz,[_hV]);}),_iF=new T(function(){return A(_iz,[_hU]);}),_iG=new T(function(){return A(_iz,[_hT]);}),_iH=new T(function(){return A(_iz,[_hS]);}),_iI=new T(function(){return A(_iz,[_hQ]);}),_iJ=new T(function(){return A(_iz,[_hO]);});return _9I([0,function(_iK){switch(E(E(_iK)[1])){case 34:return E(_iJ);case 39:return E(_iI);case 92:return E(_iH);case 97:return E(_iG);case 98:return E(_iF);case 102:return E(_iE);case 110:return E(_iD);case 114:return E(_iC);case 116:return E(_iB);case 118:return E(_iA);default:return [2];}}],new T(function(){return _9I(_aR(_d7,_de,function(_iL){var _iM=new T(function(){return _iw(E(_iL)[1]);});return _bg(_iL,function(_iN){var _iO=_cg(_iM,_c7,_iN);return !_dl(_iO,_hM)?[2]:A(_iz,[[0,new T(function(){var _iP=_di(_iO);return _iP>>>0>1114111?_dg(_iP):[0,_iP];}),_d6]]);});}),new T(function(){var _iQ=new T(function(){return A(_iz,[_iv]);}),_iR=new T(function(){return A(_iz,[_iu]);}),_iS=new T(function(){return A(_iz,[_it]);}),_iT=new T(function(){return A(_iz,[_is]);}),_iU=new T(function(){return A(_iz,[_ir]);}),_iV=new T(function(){return A(_iz,[_iq]);}),_iW=new T(function(){return A(_iz,[_ip]);}),_iX=new T(function(){return A(_iz,[_io]);}),_iY=new T(function(){return A(_iz,[_in]);}),_iZ=new T(function(){return A(_iz,[_im]);}),_j0=new T(function(){return A(_iz,[_il]);}),_j1=new T(function(){return A(_iz,[_ik]);}),_j2=new T(function(){return A(_iz,[_ij]);}),_j3=new T(function(){return A(_iz,[_ii]);}),_j4=new T(function(){return A(_iz,[_ih]);}),_j5=new T(function(){return A(_iz,[_ig]);}),_j6=new T(function(){return A(_iz,[_if]);}),_j7=new T(function(){return A(_iz,[_ie]);}),_j8=new T(function(){return A(_iz,[_id]);}),_j9=new T(function(){return A(_iz,[_ic]);}),_ja=new T(function(){return A(_iz,[_ib]);}),_jb=new T(function(){return A(_iz,[_ia]);}),_jc=new T(function(){return A(_iz,[_i9]);}),_jd=new T(function(){return A(_iz,[_i8]);}),_je=new T(function(){return A(_iz,[_i7]);}),_jf=new T(function(){return A(_iz,[_i6]);}),_jg=new T(function(){return A(_iz,[_i5]);}),_jh=new T(function(){return A(_iz,[_i4]);}),_ji=new T(function(){return A(_iz,[_i3]);}),_jj=new T(function(){return A(_iz,[_i2]);}),_jk=new T(function(){return A(_iz,[_i1]);}),_jl=new T(function(){return A(_iz,[_i0]);});return _9I([0,function(_jm){return E(E(_jm)[1])==94?E([0,function(_jn){switch(E(E(_jn)[1])){case 64:return E(_jl);case 65:return E(_jk);case 66:return E(_jj);case 67:return E(_ji);case 68:return E(_jh);case 69:return E(_jg);case 70:return E(_jf);case 71:return E(_je);case 72:return E(_jd);case 73:return E(_jc);case 74:return E(_jb);case 75:return E(_ja);case 76:return E(_j9);case 77:return E(_j8);case 78:return E(_j7);case 79:return E(_j6);case 80:return E(_j5);case 81:return E(_j4);case 82:return E(_j3);case 83:return E(_j2);case 84:return E(_j1);case 85:return E(_j0);case 86:return E(_iZ);case 87:return E(_iY);case 88:return E(_iX);case 89:return E(_iW);case 90:return E(_iV);case 91:return E(_iU);case 92:return E(_iT);case 93:return E(_iS);case 94:return E(_iR);case 95:return E(_iQ);default:return [2];}}]):[2];}],new T(function(){return A(_hL,[function(_jo){return A(_iz,[[0,_jo,_d6]]);}]);}));}));}));},_jp=function(_jq){return A(_jq,[_A]);},_jr=function(_js){var _jt=E(_js);if(!_jt[0]){return E(_jp);}else{var _ju=_jt[2],_jv=E(E(_jt[1])[1]);switch(_jv){case 9:var _jw=new T(function(){return _jr(_ju);});return function(_jx){var _jy=new T(function(){return A(_jw,[_jx]);});return [0,function(_jz){return E(_jy);}];};case 10:var _jA=new T(function(){return _jr(_ju);});return function(_jB){var _jC=new T(function(){return A(_jA,[_jB]);});return [0,function(_jD){return E(_jC);}];};case 11:var _jE=new T(function(){return _jr(_ju);});return function(_jF){var _jG=new T(function(){return A(_jE,[_jF]);});return [0,function(_jH){return E(_jG);}];};case 12:var _jI=new T(function(){return _jr(_ju);});return function(_jJ){var _jK=new T(function(){return A(_jI,[_jJ]);});return [0,function(_jL){return E(_jK);}];};case 13:var _jM=new T(function(){return _jr(_ju);});return function(_jN){var _jO=new T(function(){return A(_jM,[_jN]);});return [0,function(_jP){return E(_jO);}];};case 32:var _jQ=new T(function(){return _jr(_ju);});return function(_jR){var _jS=new T(function(){return A(_jQ,[_jR]);});return [0,function(_jT){return E(_jS);}];};case 160:var _jU=new T(function(){return _jr(_ju);});return function(_jV){var _jW=new T(function(){return A(_jU,[_jV]);});return [0,function(_jX){return E(_jW);}];};default:var _jY=u_iswspace(_jv);if(!E(_jY)){return E(_jp);}else{var _jZ=new T(function(){return _jr(_ju);});return function(_k0){var _k1=new T(function(){return A(_jZ,[_k0]);});return [0,function(_k2){return E(_k1);}];};}}}},_k3=function(_k4){var _k5=new T(function(){return _iy(_k4);}),_k6=new T(function(){return _k3(_k4);}),_k7=[1,function(_k8){return A(_jr,[_k8,function(_k9){return E([0,function(_ka){return E(E(_ka)[1])==92?E(_k6):[2];}]);}]);}];return _9I([0,function(_kb){return E(E(_kb)[1])==92?E([0,function(_kc){var _kd=E(E(_kc)[1]);switch(_kd){case 9:return E(_k7);case 10:return E(_k7);case 11:return E(_k7);case 12:return E(_k7);case 13:return E(_k7);case 32:return E(_k7);case 38:return E(_k6);case 160:return E(_k7);default:var _ke=u_iswspace(_kd);return E(_ke)==0?[2]:E(_k7);}}]):[2];}],[0,function(_kf){var _kg=E(_kf);return E(_kg[1])==92?E(_k5):A(_k4,[[0,_kg,_0]]);}]);},_kh=function(_ki,_kj){var _kk=new T(function(){return A(_kj,[[1,new T(function(){return A(_ki,[_g]);})]]);});return _k3(function(_kl){var _km=E(_kl),_kn=E(_km[1]);return E(_kn[1])==34?!E(_km[2])?E(_kk):_kh(function(_ko){return A(_ki,[[1,_kn,_ko]]);},_kj):_kh(function(_kp){return A(_ki,[[1,_kn,_kp]]);},_kj);});},_kq=unCStr("_\'"),_kr=function(_ks){var _kt=u_iswalnum(_ks);return E(_kt)==0?_cK(_af,[0,_ks],_kq):true;},_ku=function(_kv){return _kr(E(_kv)[1]);},_kw=unCStr(",;()[]{}`"),_kx=function(_ky){return A(_ky,[_g]);},_kz=function(_kA,_kB){var _kC=function(_kD){var _kE=E(_kD);if(!_kE[0]){return E(_kx);}else{var _kF=_kE[1];if(!A(_kA,[_kF])){return E(_kx);}else{var _kG=new T(function(){return _kC(_kE[2]);});return function(_kH){var _kI=new T(function(){return A(_kG,[function(_kJ){return A(_kH,[[1,_kF,_kJ]]);}]);});return [0,function(_kK){return E(_kI);}];};}}};return [1,function(_kL){return A(_kC,[_kL,_kB]);}];},_kM=unCStr(".."),_kN=unCStr("::"),_kO=unCStr("->"),_kP=[0,64],_kQ=[1,_kP,_g],_kR=[0,126],_kS=[1,_kR,_g],_kT=unCStr("=>"),_kU=[1,_kT,_g],_kV=[1,_kS,_kU],_kW=[1,_kQ,_kV],_kX=[1,_kO,_kW],_kY=unCStr("<-"),_kZ=[1,_kY,_kX],_l0=[0,124],_l1=[1,_l0,_g],_l2=[1,_l1,_kZ],_l3=[1,_hR,_g],_l4=[1,_l3,_l2],_l5=[0,61],_l6=[1,_l5,_g],_l7=[1,_l6,_l4],_l8=[1,_kN,_l7],_l9=[1,_kM,_l8],_la=function(_lb){var _lc=new T(function(){return A(_lb,[_bd]);});return _9I([1,function(_ld){return E(_ld)[0]==0?E(_lc):[2];}],new T(function(){var _le=new T(function(){return _iy(function(_lf){var _lg=E(_lf);return (function(_lh,_li){var _lj=new T(function(){return A(_lb,[[0,_lh]]);});return !E(_li)?E(E(_lh)[1])==39?[2]:[0,function(_lk){return E(E(_lk)[1])==39?E(_lj):[2];}]:[0,function(_ll){return E(E(_ll)[1])==39?E(_lj):[2];}];})(_lg[1],_lg[2]);});});return _9I([0,function(_lm){return E(E(_lm)[1])==39?E([0,function(_ln){var _lo=E(_ln);switch(E(_lo[1])){case 39:return [2];case 92:return E(_le);default:var _lp=new T(function(){return A(_lb,[[0,_lo]]);});return [0,function(_lq){return E(E(_lq)[1])==39?E(_lp):[2];}];}}]):[2];}],new T(function(){var _lr=new T(function(){return _kh(_H,_lb);});return _9I([0,function(_ls){return E(E(_ls)[1])==34?E(_lr):[2];}],new T(function(){return _9I([0,function(_lt){return !_cK(_af,_lt,_kw)?[2]:A(_lb,[[2,[1,_lt,_g]]]);}],new T(function(){return _9I([0,function(_lu){return !_cK(_af,_lu,_cP)?[2]:_kz(_cQ,function(_lv){var _lw=[1,_lu,_lv];return !_cK(_aw,_lw,_l9)?A(_lb,[[4,_lw]]):A(_lb,[[2,_lw]]);});}],new T(function(){return _9I([0,function(_lx){var _ly=E(_lx),_lz=_ly[1],_lA=u_iswalpha(_lz);return E(_lA)==0?E(_lz)==95?_kz(_ku,function(_lB){return A(_lb,[[3,[1,_ly,_lB]]]);}):[2]:_kz(_ku,function(_lC){return A(_lb,[[3,[1,_ly,_lC]]]);});}],new T(function(){return _aR(_cU,_cF,_lb);}));}));}));}));}));}));},_lD=function(_lE){var _lF=new T(function(){return _la(_lE);});return [1,function(_lG){return A(_jr,[_lG,function(_lH){return E(_lF);}]);}];},_lI=[0,0],_lJ=function(_lK,_lL){var _lM=new T(function(){return A(_lK,[_lI,function(_lN){var _lO=new T(function(){return A(_lL,[_lN]);});return _lD(function(_lP){var _lQ=E(_lP);if(_lQ[0]==2){var _lR=E(_lQ[1]);return _lR[0]==0?[2]:E(E(_lR[1])[1])==41?E(_lR[2])[0]==0?E(_lO):[2]:[2];}else{return [2];}});}]);});return _lD(function(_lS){var _lT=E(_lS);if(_lT[0]==2){var _lU=E(_lT[1]);return _lU[0]==0?[2]:E(E(_lU[1])[1])==40?E(_lU[2])[0]==0?E(_lM):[2]:[2];}else{return [2];}});},_lV=function(_lW,_lX,_lY){var _lZ=function(_m0,_m1){var _m2=new T(function(){return _la(function(_m3){return A(_lW,[_m3,_m0,function(_m4){return A(_m1,[new T(function(){return [0, -E(_m4)[1]];})]);}]);});});return _9I(_lD(function(_m5){var _m6=E(_m5);if(_m6[0]==4){var _m7=E(_m6[1]);return _m7[0]==0?A(_lW,[_m6,_m0,_m1]):E(E(_m7[1])[1])==45?E(_m7[2])[0]==0?E([1,function(_m8){return A(_jr,[_m8,function(_m9){return E(_m2);}]);}]):A(_lW,[_m6,_m0,_m1]):A(_lW,[_m6,_m0,_m1]);}else{return A(_lW,[_m6,_m0,_m1]);}}),new T(function(){return _lJ(_lZ,_m1);}));};return _lZ(_lX,_lY);},_ma=function(_mb,_mc){return [2];},_md=function(_me,_mf){return _ma(_me,_mf);},_mg=function(_mh){var _mi=E(_mh);return _mi[0]==0?[1,new T(function(){return _cg(new T(function(){return _iw(E(_mi[1])[1]);}),_c7,_mi[2]);})]:E(_mi[2])[0]==0?E(_mi[3])[0]==0?[1,new T(function(){return _cg(_c6,_c7,_mi[1]);})]:[0]:[0];},_mj=function(_mk){var _ml=E(_mk);if(_ml[0]==5){var _mm=_mg(_ml[1]);if(!_mm[0]){return E(_ma);}else{var _mn=new T(function(){return [0,_di(_mm[1])];});return function(_mo,_mp){return A(_mp,[_mn]);};}}else{return E(_md);}},_mq=function(_me,_mf){return _lV(_mj,_me,_mf);},_mr=function(_ms,_mt){var _mu=function(_mv,_mw){var _mx=new T(function(){return A(_mw,[_g]);}),_my=new T(function(){return A(_ms,[_lI,function(_mz){return _mu(_d6,function(_mA){return A(_mw,[[1,_mz,_mA]]);});}]);});return _lD(function(_mB){var _mC=E(_mB);if(_mC[0]==2){var _mD=E(_mC[1]);if(!_mD[0]){return [2];}else{var _mE=_mD[2];switch(E(E(_mD[1])[1])){case 44:return E(_mE)[0]==0?!E(_mv)?[2]:E(_my):[2];case 93:return E(_mE)[0]==0?E(_mx):[2];default:return [2];}}}else{return [2];}});},_mF=function(_mG){var _mH=new T(function(){return _9I(_mu(_0,_mG),new T(function(){return A(_ms,[_lI,function(_mI){return _mu(_d6,function(_mJ){return A(_mG,[[1,_mI,_mJ]]);});}]);}));});return _9I(_lD(function(_mK){var _mL=E(_mK);if(_mL[0]==2){var _mM=E(_mL[1]);return _mM[0]==0?[2]:E(E(_mM[1])[1])==91?E(_mM[2])[0]==0?E(_mH):[2]:[2];}else{return [2];}}),new T(function(){return _lJ(function(_mN,_mO){return _mF(_mO);},_mG);}));};return _mF(_mt);},_mP=function(_mQ,_mR){return _mr(_mq,_mR);},_mS=new T(function(){return _mr(_mq,_aJ);}),_mT=function(_mf){return _9y(_mS,_mf);},_mU=function(_mV){var _mW=new T(function(){return _lV(_mj,_mV,_aJ);});return function(_bc){return _9y(_mW,_bc);};},_mX=[0,_mU,_mT,_mq,_mP],_mY=function(_mZ,_n0){return _3F(0,E(_mZ)[1],_n0);},_n1=function(_n2,_n3){return _2w(_mY,_n2,_n3);},_n4=function(_n5,_n6,_n7){return _3F(E(_n5)[1],E(_n6)[1],_n7);},_n8=[0,_n4,_56,_n1],_n9=unCStr("GHC.Types"),_na=unCStr("Int"),_nb=[0,I_fromBits([1521842780,3792221899]),I_fromBits([1346191152,3861967380]),_5N,_n9,_na],_nc=[0,I_fromBits([1521842780,3792221899]),I_fromBits([1346191152,3861967380]),_nb,_g],_nd=function(_ne){return E(_nc);},_nf=function(_ng){return E(E(_ng)[1]);},_nh=function(_ni){return E(E(_ni)[1]);},_nj=function(_nk){return E(E(_nk)[2]);},_nl=function(_nm,_nn){var _no=new T(function(){return A(_nj,[_nm,_nn]);}),_np=new T(function(){return _nh(_nm);}),_nq=new T(function(){return _3q(_np);}),_nr=new T(function(){return _30(_np);});return function(_ns){return A(_nr,[_no,function(_nt){return A(_nq,[[0,_nt,_ns]]);}]);};},_nu=function(_nv,_nw){return A(_nv,[function(_){return jsFind(toJSStr(E(_nw)));}]);},_nx=[0],_ny=function(_nz){return E(E(_nz)[3]);},_nA=new T(function(){return E(_6G);}),_nB=new T(function(){return [0,"value"];}),_nC=function(_nD){return E(E(_nD)[6]);},_nE=unCStr("[]"),_nF=[0,I_fromBits([4033920485,4128112366]),I_fromBits([786266835,2297333520]),_5N,_n9,_nE],_nG=[0,I_fromBits([4033920485,4128112366]),I_fromBits([786266835,2297333520]),_nF,_g],_nH=function(_nI){return E(_nG);},_nJ=unCStr("Char"),_nK=[0,I_fromBits([3763641161,3907222913]),I_fromBits([1343745632,586881778]),_5N,_n9,_nJ],_nL=[0,I_fromBits([3763641161,3907222913]),I_fromBits([1343745632,586881778]),_nK,_g],_nM=function(_nN){return E(_nL);},_nO=new T(function(){return _6H(_nH,_nM);}),_nP=new T(function(){return A(_nO,[_6G]);}),_nQ=function(_nR){return E(E(_nR)[1]);},_nS=[0,0],_nT=[0,32],_nU=[0,10],_nV=function(_nW){var _nX=E(_nW);if(!_nX[0]){return E(_H);}else{var _nY=_nX[1],_nZ=E(_nX[2]);if(!_nZ[0]){return _o0(_nU,_nY);}else{var _o1=new T(function(){return _nV(_nZ);}),_o2=new T(function(){return _o0(_nU,_nY);});return function(_o3){return A(_o2,[[1,_nT,new T(function(){return A(_o1,[_o3]);})]]);};}}},_o4=unCStr("->"),_o5=[1,_o4,_g],_o6=[1,_n9,_o5],_o7=[1,_5N,_o6],_o8=[0,32],_o9=function(_oa){var _ob=E(_oa);if(!_ob[0]){return [0];}else{var _oc=_ob[1],_od=E(_ob[2]);return _od[0]==0?E(_oc):_1G(_oc,[1,_o8,new T(function(){return _o9(_od);})]);}},_oe=new T(function(){return _o9(_o7);}),_of=new T(function(){var _og=_6b(_oe);return [0,_og[1],_og[2],_5N,_n9,_o4];}),_oh=function(_oi,_oj){var _ok=E(_oi);return _ok[0]==0?E(_oj):A(_ok[1],[new T(function(){return _oh(_ok[2],_oj);})]);},_ol=[0,I_fromBits([4033920485,4128112366]),I_fromBits([786266835,2297333520])],_om=[1,_5P,_g],_on=function(_oo){var _op=E(_oo);if(!_op[0]){return [0];}else{var _oq=E(_op[1]);return [1,[0,_oq[1],_oq[2]],new T(function(){return _on(_op[2]);})];}},_or=new T(function(){var _os=_1G(_g,_om);if(!_os[0]){return E(_nF);}else{var _ot=_6b(new T(function(){return _5Z(_6n(_6y,[1,_ol,new T(function(){return _on(_os);})]));}));return E(_nF);}}),_ou=[0,40],_ov=function(_ow){return _o0(_nU,_ow);},_ox=[0,8],_oy=unCStr(" -> "),_oz=[0,9],_oA=[0,93],_oB=[0,91],_oC=[0,41],_oD=[0,44],_oE=function(_ow){return [1,_oD,_ow];},_oF=function(_oG,_oH){var _oI=E(_oH);return _oI[0]==0?[0]:[1,_oG,[1,_oI[1],new T(function(){return _oF(_oG,_oI[2]);})]];},_o0=function(_oJ,_oK){var _oL=E(_oK),_oM=_oL[3],_oN=E(_oL[4]);if(!_oN[0]){return function(_oO){return _1G(E(_oM)[5],_oO);};}else{var _oP=_oN[1],_oQ=new T(function(){var _oR=E(_oM)[5],_oS=new T(function(){return _nV(_oN);}),_oT=new T(function(){return E(_oJ)[1]<=9?function(_oU){return _1G(_oR,[1,_nT,new T(function(){return A(_oS,[_oU]);})]);}:function(_oV){return [1,_3E,new T(function(){return _1G(_oR,[1,_nT,new T(function(){return A(_oS,[[1,_3D,_oV]]);})]);})];};}),_oW=E(_oR);if(!_oW[0]){return E(_oT);}else{if(E(E(_oW[1])[1])==40){var _oX=E(_oW[2]);return _oX[0]==0?E(_oT):E(E(_oX[1])[1])==44?function(_oY){return [1,_ou,new T(function(){return A(new T(function(){var _oZ=_6n(_ov,_oN);if(!_oZ[0]){return E(_H);}else{var _p0=new T(function(){return _oF(_oE,_oZ[2]);});return function(_bc){return _oh([1,_oZ[1],_p0],_bc);};}}),[[1,_oC,_oY]]);})];}:E(_oT);}else{return E(_oT);}}}),_p1=E(_oN[2]);if(!_p1[0]){var _p2=E(_oM),_p3=E(_or),_p4=hs_eqWord64(_p2[1],_p3[1]);if(!E(_p4)){return E(_oQ);}else{var _p5=hs_eqWord64(_p2[2],_p3[2]);if(!E(_p5)){return E(_oQ);}else{var _p6=new T(function(){return _o0(_nS,_oP);});return function(_p7){return [1,_oB,new T(function(){return A(_p6,[[1,_oA,_p7]]);})];};}}}else{if(!E(_p1[2])[0]){var _p8=E(_oM),_p9=E(_of),_pa=hs_eqWord64(_p8[1],_p9[1]);if(!E(_pa)){return E(_oQ);}else{var _pb=hs_eqWord64(_p8[2],_p9[2]);if(!E(_pb)){return E(_oQ);}else{var _pc=new T(function(){return _o0(_ox,_p1[1]);}),_pd=new T(function(){return _o0(_oz,_oP);});return E(_oJ)[1]<=8?function(_pe){return A(_pd,[new T(function(){return _1G(_oy,new T(function(){return A(_pc,[_pe]);}));})]);}:function(_pf){return [1,_3E,new T(function(){return A(_pd,[new T(function(){return _1G(_oy,new T(function(){return A(_pc,[[1,_3D,_pf]]);}));})]);})];};}}}else{return E(_oQ);}}}},_pg=function(_ph,_pi,_pj,_pk,_pl,_pm){var _pn=E(_ph),_po=_pn[1],_pp=_pn[3],_pq=new T(function(){return A(_pp,[_nx]);}),_pr=new T(function(){return _ny(_pl);}),_ps=new T(function(){return _nC(_pl);}),_pt=new T(function(){return unAppCStr("\" as type ",new T(function(){return A(_o0,[_nS,A(_pj,[_nA]),_g]);}));}),_pu=new T(function(){return A(_nQ,[_pk,_8]);});return A(_po,[new T(function(){return _nu(_pi,_pm);}),function(_pv){var _pw=E(_pv);return _pw[0]==0?E(_pq):A(_po,[new T(function(){return A(_pi,[function(_){var _px=jsGet(E(_pw[1])[1],E(_nB)[1]);return [1,new T(function(){return fromJSStr(_px);})];}]);}),function(_py){var _pz=E(_py);if(!_pz[0]){return E(_pq);}else{var _pA=_pz[1];if(!E(new T(function(){var _pB=A(_pj,[_nA]),_pC=E(_nP),_pD=hs_eqWord64(_pB[1],_pC[1]);if(!E(_pD)){return false;}else{var _pE=hs_eqWord64(_pB[2],_pC[2]);return E(_pE)==0?false:true;}}))){var _pF=new T(function(){return A(_pp,[[1,_pA,new T(function(){return A(_ps,[new T(function(){return A(_pr,[new T(function(){return unAppCStr("can\'t read \"",new T(function(){return _1G(_pA,_pt);}));})]);})]);})]]);}),_pG=A(_pu,[_pA]);if(!_pG[0]){return E(_pF);}else{var _pH=E(_pG[1]);return E(_pH[2])[0]==0?E(_pG[2])[0]==0?A(_pp,[[2,_pH[1]]]):E(_pF):E(_pF);}}else{return A(_pp,[[2,_pA]]);}}}]);}]);},_pI=1,_pJ=function(_pK){return E(E(_pK)[9]);},_pL=function(_pM,_pN){return A(_3q,[_pM,[0,_pN,_pN]]);},_pO=function(_pP){return E(E(_pP)[2]);},_pQ=function(_pR,_pS,_pT){return A(_3q,[_pR,[0,_A,_pS]]);},_pU=function(_pV){return E(E(_pV)[2]);},_pW=function(_pX,_pY,_pZ,_q0,_q1){var _q2=new T(function(){return _nf(_pX);}),_q3=new T(function(){return _pO(_q2);}),_q4=new T(function(){return _nh(_pY);}),_q5=new T(function(){return _3s(_q4);}),_q6=new T(function(){return _3K([0,coercionToken],_q5,function(_q7){return _pL(_q4,_q7);},function(_q8,_q9){return _pQ(_q4,_q8,_q9);});}),_qa=new T(function(){return _3q(_q4);}),_qb=new T(function(){return _30(_q4);}),_qc=new T(function(){return _3q(_q4);}),_qd=new T(function(){return _30(_q4);}),_qe=new T(function(){return _3q(_q4);}),_qf=new T(function(){return _30(_q4);}),_qg=new T(function(){return _3q(_q4);}),_qh=new T(function(){return _30(_q4);}),_qi=new T(function(){return _pU(_q0);}),_qj=new T(function(){return _pJ(_pX);});return function(_qk,_ql,_qm){return function(_qn){return A(_qh,[new T(function(){var _qo=E(_qk);return _qo[0]==0?A(_q6,[_qn]):A(_qg,[[0,_qo[1],_qn]]);}),function(_qp){var _qq=new T(function(){return E(E(_qp)[1]);}),_qr=new T(function(){return _pg(_q5,function(_qs){return _nl(_pY,_qs);},_pZ,_q1,_pX,_qq);}),_qt=new T(function(){return A(_qj,[_qq,_ql,new T(function(){var _qu=E(_qm);if(!_qu[0]){return [0];}else{var _qv=_qu[1],_qw=_1q(_pZ,_nO,_qv);return _qw[0]==0?A(_qi,[_qv]):E(_qw[1]);}}),_0,_9]);});return A(_qf,[new T(function(){var _qx=new T(function(){return E(E(_qp)[2]);});return A(_qe,[[0,_qx,_qx]]);}),function(_qy){return A(_qd,[new T(function(){return A(_qc,[[0,_A,new T(function(){var _qz=E(E(_qy)[1]);return [0,_qz[1],_qz[2],_pI,_qz[4],_qz[5],_qz[6]];})]]);}),function(_qA){return A(_qb,[new T(function(){return A(_qr,[new T(function(){return E(E(_qA)[2]);})]);}),function(_qB){var _qC=E(_qB),_qD=_qC[2],_qE=E(_qC[1]);switch(_qE[0]){case 0:return A(_qa,[[0,[0,_qt,_9],_qD]]);case 1:return A(_qa,[[0,[0,new T(function(){return A(_q3,[new T(function(){return A(_qj,[_qq,_ql,_qE[1],_0,_9]);}),_qE[2]]);}),_9],_qD]]);default:var _qF=_qE[1];return A(_qa,[[0,[0,new T(function(){return A(_qj,[_qq,_ql,new T(function(){var _qG=_1q(_pZ,_nO,_qF);return _qG[0]==0?A(_qi,[_qF]):E(_qG[1]);}),_0,_9]);}),[1,_qF]],_qD]]);}}]);}]);}]);}]);};};},_qH=new T(function(){return _pW(_8E,_8F,_nd,_n8,_mX);}),_qI=new T(function(){return A(_qH,[_9,_5E,_9]);}),_qJ=unCStr("keydown"),_qK=unCStr("mousemove"),_qL=unCStr("blur"),_qM=unCStr("focus"),_qN=unCStr("change"),_qO=unCStr("unload"),_qP=unCStr("load"),_qQ=unCStr("keyup"),_qR=unCStr("keypress"),_qS=unCStr("mouseup"),_qT=unCStr("mousedown"),_qU=unCStr("dblclick"),_qV=unCStr("click"),_qW=unCStr("mouseout"),_qX=unCStr("mouseover"),_qY=function(_qZ){switch(E(_qZ)[0]){case 0:return E(_qP);case 1:return E(_qO);case 2:return E(_qN);case 3:return E(_qM);case 4:return E(_qL);case 5:return E(_qK);case 6:return E(_qX);case 7:return E(_qW);case 8:return E(_qV);case 9:return E(_qU);case 10:return E(_qT);case 11:return E(_qS);case 12:return E(_qR);case 13:return E(_qQ);default:return E(_qJ);}},_r0=[0],_r1=unCStr("OnLoad"),_r2=[0,_r1,_r0],_r3=function(_){var _=0,_r4=newMVar(),_=putMVar(_r4,_r2);return [0,_r4];},_r5=new T(function(){return _2(_r3);}),_r6=function(_r7,_r8,_){var _r9=A(_r7,[_]);return die(_r8);},_ra=function(_rb,_rc,_rd,_){return _r6(function(_){var _=putMVar(_rc,_rb);return _A;},_rd,_);},_re=function(_rf,_){var _rg=0;if(!E(_rg)){return (function(_){var _rh=E(_r5)[1],_ri=takeMVar(_rh),_rj=jsCatch(function(_){return (function(_){return _rf;})();},function(_X,_){return _ra(_ri,_rh,_X,_);}),_=putMVar(_rh,_rj);return _A;})();}else{var _rk=E(_r5)[1],_rl=takeMVar(_rk),_rm=jsCatch(function(_){return _rf;},function(_X,_){return _ra(_rl,_rk,_X,_);}),_=putMVar(_rk,_rm);return _A;}},_rn=unCStr("true"),_ro=function(_rp,_rq){while(1){var _rr=E(_rp);if(!_rr[0]){return E(_rq)[0]==0?true:false;}else{var _rs=E(_rq);if(!_rs[0]){return false;}else{if(E(_rr[1])[1]!=E(_rs[1])[1]){return false;}else{_rp=_rr[2];_rq=_rs[2];continue;}}}}},_rt=new T(function(){return [0,"keydown"];}),_ru=new T(function(){return [0,"mousemove"];}),_rv=new T(function(){return [0,"blur"];}),_rw=new T(function(){return [0,"focus"];}),_rx=new T(function(){return [0,"change"];}),_ry=new T(function(){return [0,"unload"];}),_rz=new T(function(){return [0,"load"];}),_rA=new T(function(){return [0,"keyup"];}),_rB=new T(function(){return [0,"keypress"];}),_rC=new T(function(){return [0,"mouseup"];}),_rD=new T(function(){return [0,"mousedown"];}),_rE=new T(function(){return [0,"dblclick"];}),_rF=new T(function(){return [0,"click"];}),_rG=new T(function(){return [0,"mouseout"];}),_rH=new T(function(){return [0,"mouseover"];}),_rI=function(_rJ){switch(E(_rJ)[0]){case 0:return E(_rz);case 1:return E(_ry);case 2:return E(_rx);case 3:return E(_rw);case 4:return E(_rv);case 5:return E(_ru);case 6:return E(_rH);case 7:return E(_rG);case 8:return E(_rF);case 9:return E(_rE);case 10:return E(_rD);case 11:return E(_rC);case 12:return E(_rB);case 13:return E(_rA);default:return E(_rt);}},_rK=function(_rL,_rM,_rN){var _rO=new T(function(){return _qY(_rM);}),_rP=new T(function(){return _rI(_rM);});return function(_rQ,_){var _rR=A(_rL,[_rQ,_]),_rS=E(_rR),_rT=_rS[1],_rU=E(_rO),_rV=jsGetAttr(_rT,toJSStr(_rU));if(!_ro(fromJSStr(_rV),_rn)){var _rW=E(_rN),_rX=jsSetCB(_rT,E(_rP)[1],E([0,_rN])[1]),_rY=A(_B,[_H,_rS,_rU,_rn,_]);return _rS;}else{return _rS;}};},_rZ=function(_s0,_s1){var _s2=new T(function(){return _qY(_s1);}),_s3=[0,_s2,_r0];return function(_s4,_){var _s5=E(_s4),_s6=E(_s5[4]),_s7=_s6[1],_s8=_s6[2],_s9=A(_s0,[_s5,_]),_sa=E(_s9),_sb=E(_sa[1]),_sc=_sb[1];return [0,[0,new T(function(){var _sd=E(_s1);switch(_sd[0]){case 0:return _rK(_sc,_sd,function(_){var _se=_re(_s3,_),_sf=A(_s7,[_]),_sg=E(_sf);if(!_sg[0]){return _A;}else{var _sh=A(_s8,[_sg[1],_]);return _A;}});case 1:return _rK(_sc,_sd,function(_){var _si=_re(_s3,_),_sj=A(_s7,[_]),_sk=E(_sj);if(!_sk[0]){return _A;}else{var _sl=A(_s8,[_sk[1],_]);return _A;}});case 2:return _rK(_sc,_sd,function(_){var _sm=_re(_s3,_),_sn=A(_s7,[_]),_so=E(_sn);if(!_so[0]){return _A;}else{var _sp=A(_s8,[_so[1],_]);return _A;}});case 3:return _rK(_sc,_sd,function(_){var _sq=_re(_s3,_),_sr=A(_s7,[_]),_ss=E(_sr);if(!_ss[0]){return _A;}else{var _st=A(_s8,[_ss[1],_]);return _A;}});case 4:return _rK(_sc,_sd,function(_){var _su=_re(_s3,_),_sv=A(_s7,[_]),_sw=E(_sv);if(!_sw[0]){return _A;}else{var _sx=A(_s8,[_sw[1],_]);return _A;}});case 5:return _rK(_sc,_sd,function(_sy,_){var _sz=_re([0,_s2,[2,E(_sy)]],_),_sA=A(_s7,[_]),_sB=E(_sA);if(!_sB[0]){return _A;}else{var _sC=A(_s8,[_sB[1],_]);return _A;}});case 6:return _rK(_sc,_sd,function(_sD,_){var _sE=_re([0,_s2,[2,E(_sD)]],_),_sF=A(_s7,[_]),_sG=E(_sF);if(!_sG[0]){return _A;}else{var _sH=A(_s8,[_sG[1],_]);return _A;}});case 7:return _rK(_sc,_sd,function(_){var _sI=A(_s7,[_]),_sJ=E(_sI);if(!_sJ[0]){return _A;}else{var _sK=A(_s8,[_sJ[1],_]);return _A;}});case 8:return _rK(_sc,_sd,function(_sL,_sM,_){var _sN=_re([0,_s2,[1,_sL,E(_sM)]],_),_sO=A(_s7,[_]),_sP=E(_sO);if(!_sP[0]){return _A;}else{var _sQ=A(_s8,[_sP[1],_]);return _A;}});case 9:return _rK(_sc,_sd,function(_sR,_sS,_){var _sT=_re([0,_s2,[1,_sR,E(_sS)]],_),_sU=A(_s7,[_]),_sV=E(_sU);if(!_sV[0]){return _A;}else{var _sW=A(_s8,[_sV[1],_]);return _A;}});case 10:return _rK(_sc,_sd,function(_sX,_sY,_){var _sZ=_re([0,_s2,[1,_sX,E(_sY)]],_),_t0=A(_s7,[_]),_t1=E(_t0);if(!_t1[0]){return _A;}else{var _t2=A(_s8,[_t1[1],_]);return _A;}});case 11:return _rK(_sc,_sd,function(_t3,_t4,_){var _t5=_re([0,_s2,[1,_t3,E(_t4)]],_),_t6=A(_s7,[_]),_t7=E(_t6);if(!_t7[0]){return _A;}else{var _t8=A(_s8,[_t7[1],_]);return _A;}});case 12:return _rK(_sc,_sd,function(_t9,_){var _ta=_re([0,_s2,[3,_t9]],_),_tb=A(_s7,[_]),_tc=E(_tb);if(!_tc[0]){return _A;}else{var _td=A(_s8,[_tc[1],_]);return _A;}});case 13:return _rK(_sc,_sd,function(_te,_){var _tf=_re([0,_s2,[3,_te]],_),_tg=A(_s7,[_]),_th=E(_tg);if(!_th[0]){return _A;}else{var _ti=A(_s8,[_th[1],_]);return _A;}});default:return _rK(_sc,_sd,function(_tj,_){var _tk=_re([0,_s2,[3,_tj]],_),_tl=A(_s7,[_]),_tm=E(_tl);if(!_tm[0]){return _A;}else{var _tn=A(_s8,[_tm[1],_]);return _A;}});}}),_sb[2]],_sa[2]];};},_to=new T(function(){return _rZ(_qI,_5D);}),_tp=new T(function(){return A(_qH,[_9,_5E,_9]);}),_tq=new T(function(){return _rZ(_tp,_5D);}),_tr=unCStr("second number "),_ts=function(_tt,_){var _tu=A(_tq,[_tt,_]),_tv=E(_tu),_tw=E(_tv[1]),_tx=A(_to,[_tv[2],_]),_ty=E(_tx),_tz=E(_ty[1]);return [0,[0,function(_tA,_){var _tB=_4O(_5C,_tA,_),_tC=_5y(_tA,_),_tD=A(_tw[1],[_tA,_]),_tE=_5y(_tA,_),_tF=_4O(_tr,_tA,_),_tG=_5y(_tA,_),_tH=A(_tz[1],[_tA,_]),_tI=_5y(_tA,_);return _tA;},new T(function(){var _tJ=E(_tw[2]);if(!_tJ[0]){return [0];}else{var _tK=E(_tz[2]);return _tK[0]==0?[0]:[1,new T(function(){return _5u(_tJ[1],_tK[1]);})];}})],_ty[2]];},_tL=function(_tM,_){var _tN=_4f(_ts,_5n,_tM,_),_tO=E(_tN),_tP=E(_tO[1]),_tQ=new T(function(){return _4W(_5l,_tP[1]);});return [0,[0,function(_tR,_){var _tS=A(_55,[_tR,_]),_tT=A(_tQ,[_tR,_]);return _tR;},_tP[2]],_tO[2]];},_tU=new T(function(){return [0,"(function(){return document.body;})"];}),_tV=function(_){var _tW=A(_5,[_tU,_]);return _l(_tL,[0,_tW],_);},_tX=function(_){return _tV(_);};
var hasteMain = function() {A(_tX, [0]);};window.onload = hasteMain;