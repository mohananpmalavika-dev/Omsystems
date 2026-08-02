"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// ../node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key2 in object) {
      if (Object.prototype.hasOwnProperty.call(object, key2)) {
        keys.push(key2);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// ../node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// ../node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// ../node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// ../node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue2 = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue2.push(s.value);
    }
    return { status: status.value, value: arrayValue2 };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key2 = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key: key2,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key: key2, value } = pair;
      if (key2.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key2.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key2.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key2.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// ../node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// ../node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path, key2) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key2;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result2) => {
  if (isValid(result2)) {
    return { success: true, data: result2.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result2 = this._parse(input);
    if (isAsync(result2)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result2;
  }
  _parseAsync(input) {
    const result2 = this._parse(input);
    return Promise.resolve(result2);
  }
  parse(data, params) {
    const result2 = this.safeParse(data, params);
    if (result2.success)
      return result2.data;
    throw result2.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result2 = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result2);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result2 = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result2) ? {
          value: result2.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result2) => isValid(result2) ? {
      value: result2.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result2 = await this.safeParseAsync(data, params);
    if (result2.success)
      return result2.data;
    throw result2.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result2 = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result2);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result2 = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result2 instanceof Promise) {
        return result2.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result2) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result3) => {
        return ParseStatus.mergeArray(status, result3);
      });
    }
    const result2 = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result2);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema2, params) => {
  return new ZodArray({
    type: schema2,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema2) {
  if (schema2 instanceof ZodObject) {
    const newShape = {};
    for (const key2 in schema2.shape) {
      const fieldSchema = schema2.shape[key2];
      newShape[key2] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema2._def,
      shape: () => newShape
    });
  } else if (schema2 instanceof ZodArray) {
    return new ZodArray({
      ...schema2._def,
      type: deepPartialify(schema2.element)
    });
  } else if (schema2 instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema2.unwrap()));
  } else if (schema2 instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema2.unwrap()));
  } else if (schema2 instanceof ZodTuple) {
    return ZodTuple.create(schema2.items.map((item) => deepPartialify(item)));
  } else {
    return schema2;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key2 in ctx.data) {
        if (!shapeKeys.includes(key2)) {
          extraKeys.push(key2);
        }
      }
    }
    const pairs = [];
    for (const key2 of shapeKeys) {
      const keyValidator = shape[key2];
      const value = ctx.data[key2];
      pairs.push({
        key: { status: "valid", value: key2 },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key2)),
        alwaysSet: key2 in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key2 of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key2 },
            value: { status: "valid", value: ctx.data[key2] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key2 of extraKeys) {
        const value = ctx.data[key2];
        pairs.push({
          key: { status: "valid", value: key2 },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key2)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key2 in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key2 = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key: key2,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key2, schema2) {
    return this.augment({ [key2]: schema2 });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key2 of util.objectKeys(mask)) {
      if (mask[key2] && this.shape[key2]) {
        shape[key2] = this.shape[key2];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key2 of util.objectKeys(this.shape)) {
      if (!mask[key2]) {
        shape[key2] = this.shape[key2];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key2 of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key2];
      if (mask && !mask[key2]) {
        newShape[key2] = fieldSchema;
      } else {
        newShape[key2] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key2 of util.objectKeys(this.shape)) {
      if (mask && !mask[key2]) {
        newShape[key2] = this.shape[key2];
      } else {
        const fieldSchema = this.shape[key2];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key2] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result2 of results) {
        if (result2.result.status === "valid") {
          return result2.result;
        }
      }
      for (const result2 of results) {
        if (result2.result.status === "dirty") {
          ctx.common.issues.push(...result2.ctx.common.issues);
          return result2.result;
        }
      }
      const unionErrors = results.map((result2) => new ZodError(result2.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result2 = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result2.status === "valid") {
          return result2;
        } else if (result2.status === "dirty" && !dirty) {
          dirty = { result: result2, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key2) => bKeys.indexOf(key2) !== -1);
    const newObj = { ...a, ...b };
    for (const key2 of sharedKeys) {
      const sharedValue = mergeValues(a[key2], b[key2]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key2] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema2 = this._def.items[itemIndex] || this._def.rest;
      if (!schema2)
        return null;
      return schema2._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key2 in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key2, ctx.path, key2)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key2], ctx.path, key2)),
        alwaysSet: key2 in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key2, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key2, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key2 = await pair.key;
          const value = await pair.value;
          if (key2.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key2.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key2.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key2 = pair.key;
        const value = pair.value;
        if (key2.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key2.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key2.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result2 = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result2, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result2, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result2 = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result2, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result2, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema2, params) => {
  return new ZodPromise({
    type: schema2,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result2 = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result2.status === "aborted")
            return INVALID;
          if (result2.status === "dirty")
            return DIRTY(result2.value);
          if (status.value === "dirty")
            return DIRTY(result2.value);
          return result2;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result2 = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result2.status === "aborted")
          return INVALID;
        if (result2.status === "dirty")
          return DIRTY(result2.value);
        if (status.value === "dirty")
          return DIRTY(result2.value);
        return result2;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result2 = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result2);
        }
        if (result2 instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result2 = effect.transform(base.value, checkCtx);
        if (result2 instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result2 };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result2) => ({
            status: status.value,
            value: result2
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema2, effect, params) => {
  return new ZodEffects({
    schema: schema2,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema2, params) => {
  return new ZodEffects({
    schema: schema2,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result2 = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result2)) {
      return result2.then((result3) => {
        return {
          status: "valid",
          value: result3.status === "valid" ? result3.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result2.status === "valid" ? result2.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result2 = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result2) ? result2.then((data) => freeze(data)) : freeze(result2);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: (arg) => ZodString.create({ ...arg, coerce: true }),
  number: (arg) => ZodNumber.create({ ...arg, coerce: true }),
  boolean: (arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  }),
  bigint: (arg) => ZodBigInt.create({ ...arg, coerce: true }),
  date: (arg) => ZodDate.create({ ...arg, coerce: true })
};
var NEVER = INVALID;

// src/config.ts
var schema = external_exports.object({
  CONTROL_PLANE_URL: external_exports.string().url(),
  BRANCH_ID: external_exports.preprocess((value) => value === "" ? void 0 : value, external_exports.string().min(1).optional()),
  EDGE_AGENT_ID: external_exports.preprocess((value) => value === "" ? void 0 : value, external_exports.string().min(1).optional()),
  EDGE_ACTIVATION_CODE: external_exports.preprocess((value) => value === "" ? void 0 : value, external_exports.string().startsWith("sgact_").min(40).optional()),
  EDGE_AGENT_NAME: external_exports.string().min(2),
  EDGE_AGENT_VERSION: external_exports.string().default("0.1.0"),
  DEV_USER_ID: external_exports.preprocess((value) => value === "" ? void 0 : value, external_exports.string().min(1).optional()),
  CAMERA_USERNAME: external_exports.string().default(""),
  CAMERA_PASSWORD: external_exports.string().default(""),
  ONVIF_ENDPOINTS: external_exports.string().default(""),
  AUTO_DISCOVERY_ENABLED: external_exports.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  AUTO_DISCOVERY_INTERVAL_MS: external_exports.coerce.number().int().min(6e4).max(864e5).default(15 * 6e4),
  DISCOVERY_TIMEOUT_MS: external_exports.coerce.number().int().min(500).max(3e4).default(5e3),
  ONVIF_TIMEOUT_MS: external_exports.coerce.number().int().min(500).max(3e4).default(8e3),
  FFPROBE_PATH: external_exports.string().default("ffprobe"),
  FFMPEG_PATH: external_exports.string().default("ffmpeg"),
  LIVE_MEDIA_ENABLED: external_exports.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  EDGE_MANAGED_MEDIA_BOOTSTRAP: external_exports.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  EDGE_LIVE_GATEWAY_HOST: external_exports.string().default("127.0.0.1"),
  EDGE_LIVE_GATEWAY_PORT: external_exports.coerce.number().int().min(1).max(65535).default(8090),
  MEDIAMTX_PATH: external_exports.string().default("mediamtx"),
  MEDIA_RUNTIME_MANAGED: external_exports.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  MEDIAMTX_API_URL: external_exports.string().url().default("http://127.0.0.1:9997"),
  MEDIAMTX_HLS_URL: external_exports.string().url().default("http://127.0.0.1:8888"),
  MEDIA_TUNNEL_MODE: external_exports.enum(["disabled", "quick", "named"]).default("disabled"),
  CLOUDFLARED_PATH: external_exports.string().default("cloudflared"),
  CLOUDFLARED_TUNNEL_TOKEN: external_exports.preprocess(
    (value) => value === "" ? void 0 : value,
    external_exports.string().min(20).optional()
  ),
  MEDIA_ACCESS_TTL_SECONDS: external_exports.coerce.number().int().min(30).max(3600).default(300),
  CAMERA_HEARTBEAT_INTERVAL_MS: external_exports.coerce.number().int().min(5e3).max(36e5).default(3e4),
  CAMERA_CONFIG_REFRESH_MS: external_exports.coerce.number().int().min(5e3).max(36e5).default(6e4),
  PUBLIC_MEDIA_GATEWAY_URL: external_exports.preprocess(
    (value) => value === "" ? void 0 : value,
    external_exports.string().url().optional()
  ),
  STREAM_SECRET_STORE_PATH: external_exports.string().default("./data/stream-secrets.json"),
  STREAM_SECRET_PROVIDER_HOST: external_exports.string().default("127.0.0.1"),
  STREAM_SECRET_PROVIDER_PORT: external_exports.coerce.number().int().min(1).max(65535).default(8093),
  EDGE_MEDIA_SHARED_KEY: external_exports.preprocess(
    (value) => value === "" ? void 0 : value,
    external_exports.string().min(32).optional()
  ),
  EDGE_BRIDGE_SHARED_KEY: external_exports.preprocess(
    (value) => value === "" ? void 0 : value,
    external_exports.string().min(32).optional()
  ),
  EDGE_IDENTITY_PATH: external_exports.string().default("./data/device-identity.enc"),
  EDGE_IDENTITY_KEY_PATH: external_exports.string().default("./data/device-identity.key"),
  EDGE_OFFLINE_OUTBOX_PATH: external_exports.string().default("./data/offline-outbox.enc"),
  EDGE_OFFLINE_OUTBOX_KEY_PATH: external_exports.string().default("./data/offline-outbox.key"),
  EDGE_OFFLINE_OUTBOX_MAX_ITEMS: external_exports.coerce.number().int().min(100).max(1e5).default(1e4),
  EDGE_CAMERA_CREDENTIAL_VAULT_PATH: external_exports.string().default("./data/camera-credentials.enc"),
  EDGE_CAMERA_CREDENTIAL_VAULT_KEY_PATH: external_exports.string().default("./data/camera-credentials.key"),
  EDGE_UPDATE_PUBLIC_KEY: external_exports.preprocess((value) => value === "" ? void 0 : value, external_exports.string().min(64).optional()),
  EDGE_UPDATE_STAGING_PATH: external_exports.string().default("./data/updates"),
  CONTROL_PLANE_TIMEOUT_MS: external_exports.coerce.number().int().min(1e3).max(12e4).default(15e3),
  EDGE_LOG_PATH: external_exports.string().min(1).default("./logs/edge-agent.log"),
  INTERNET_LINKS_JSON: external_exports.string().default("[]").transform((value, context) => {
    try {
      return JSON.parse(value);
    } catch {
      context.addIssue({ code: external_exports.ZodIssueCode.custom, message: "INTERNET_LINKS_JSON must be valid JSON" });
      return external_exports.NEVER;
    }
  }).pipe(external_exports.array(external_exports.object({
    id: external_exports.string().min(1),
    role: external_exports.enum(["primary", "backup"]),
    ispName: external_exports.string().min(1),
    interfaceName: external_exports.string().min(1).optional(),
    sourceAddress: external_exports.string().min(1).optional(),
    targets: external_exports.array(external_exports.string().url()).min(1),
    gatewayAddress: external_exports.string().min(1).optional(),
    publicIpEndpoint: external_exports.string().url().optional(),
    contractedDownMbps: external_exports.number().positive().optional(),
    contractedUpMbps: external_exports.number().positive().optional()
  })).max(4)),
  INTERNET_PROBE_TIMEOUT_MS: external_exports.coerce.number().int().min(250).max(3e4).default(3e3),
  INTERNET_PROBE_ATTEMPTS: external_exports.coerce.number().int().min(1).max(10).default(3),
  INTERNET_PATH_WINDOW_MS: external_exports.coerce.number().int().min(6e4).max(864e5).default(3e5),
  EDGE_HEALTH_DISK_PATH: external_exports.string().min(1).default("."),
  RECORDERS_JSON: external_exports.string().default("[]").transform((value, context) => {
    try {
      return JSON.parse(value);
    } catch {
      context.addIssue({ code: external_exports.ZodIssueCode.custom, message: "RECORDERS_JSON must be valid JSON" });
      return external_exports.NEVER;
    }
  }).pipe(external_exports.array(external_exports.object({
    id: external_exports.string().min(1).max(80),
    name: external_exports.string().min(1),
    deviceType: external_exports.enum(["dvr", "nvr"]),
    vendor: external_exports.enum(["hikvision", "dahua", "cp-plus", "onvif", "generic"]),
    model: external_exports.string().optional(),
    host: external_exports.string().min(1),
    port: external_exports.number().int().min(1).max(65535),
    rtspPort: external_exports.number().int().min(1).max(65535).optional(),
    secure: external_exports.boolean().optional(),
    username: external_exports.string().optional(),
    password: external_exports.string().optional(),
    systemPath: external_exports.string().startsWith("/").optional(),
    storagePath: external_exports.string().startsWith("/").optional(),
    // Maps recorder-native channel numbers to approved control-plane camera IDs.
    // The mapping is deliberately explicit: a branch can have more than one
    // recorder, so a camera's display channel alone is not a safe association.
    archiveRetention: external_exports.object({
      lookbackDays: external_exports.number().int().min(1).max(3650).default(400),
      maxResults: external_exports.number().int().min(100).max(1e6).default(5e5),
      // Use a value no greater than the branch policy's allowed gap. A smaller
      // value is conservative and remains valid for a less strict policy.
      continuityGapSeconds: external_exports.number().int().min(0).max(86400).default(30),
      verifyPlayback: external_exports.boolean().default(true),
      channels: external_exports.array(external_exports.object({
        cameraId: external_exports.string().min(1).max(200),
        channel: external_exports.number().int().min(0).max(65535)
      })).min(1).max(128).superRefine((channels, context) => {
        const cameraIds = /* @__PURE__ */ new Set();
        const channelIds = /* @__PURE__ */ new Set();
        channels.forEach((item, index) => {
          if (cameraIds.has(item.cameraId)) context.addIssue({ code: external_exports.ZodIssueCode.custom, path: [index, "cameraId"], message: "Each cameraId may be mapped once per recorder" });
          if (channelIds.has(item.channel)) context.addIssue({ code: external_exports.ZodIssueCode.custom, path: [index, "channel"], message: "Each recorder channel may be mapped once" });
          cameraIds.add(item.cameraId);
          channelIds.add(item.channel);
        });
      })
    }).optional()
  })).max(128)),
  RECORDER_POLL_INTERVAL_MS: external_exports.coerce.number().int().min(5e3).max(36e5).default(3e4),
  RECORDER_PROBE_TIMEOUT_MS: external_exports.coerce.number().int().min(500).max(6e4).default(5e3),
  RECORDER_ARCHIVE_SCAN_INTERVAL_MS: external_exports.coerce.number().int().min(6e4).max(7 * 864e5).default(6 * 36e5)
}).superRefine((value, context) => {
  if (value.EDGE_BRIDGE_SHARED_KEY && !value.EDGE_AGENT_ID) {
    context.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["EDGE_AGENT_ID"],
      message: "EDGE_AGENT_ID is required with EDGE_BRIDGE_SHARED_KEY; download a branch-specific package from the dashboard"
    });
  }
  if (!value.EDGE_ACTIVATION_CODE && !(value.BRANCH_ID && value.EDGE_AGENT_ID && value.EDGE_BRIDGE_SHARED_KEY) && !value.DEV_USER_ID) {
    context.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["EDGE_ACTIVATION_CODE"],
      message: "Provide a one-time EDGE_ACTIVATION_CODE, or an existing legacy/development identity"
    });
  }
  if (value.LIVE_MEDIA_ENABLED && value.MEDIA_TUNNEL_MODE === "disabled" && !value.PUBLIC_MEDIA_GATEWAY_URL) {
    context.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["PUBLIC_MEDIA_GATEWAY_URL"], message: "Live media without a tunnel requires a reachable PUBLIC_MEDIA_GATEWAY_URL" });
  }
  if (value.LIVE_MEDIA_ENABLED && value.MEDIA_TUNNEL_MODE === "named" && !value.EDGE_MANAGED_MEDIA_BOOTSTRAP && (!value.CLOUDFLARED_TUNNEL_TOKEN || !value.PUBLIC_MEDIA_GATEWAY_URL)) {
    context.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["CLOUDFLARED_TUNNEL_TOKEN"], message: "Named media tunnels require CLOUDFLARED_TUNNEL_TOKEN and PUBLIC_MEDIA_GATEWAY_URL" });
  }
});
function loadEdgeConfig(environment = process.env) {
  return schema.parse(environment);
}

// src/discovery/onvif-discovery.ts
var import_node_dgram = __toESM(require("node:dgram"), 1);
var import_node_crypto = require("node:crypto");

// ../node_modules/fast-xml-parser/src/util.js
var nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
var nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
var nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
var regexName = new RegExp("^" + nameRegexp + "$");
function getAllMatches(string, regex) {
  const matches = [];
  let match = regex.exec(string);
  while (match) {
    const allmatches = [];
    allmatches.startIndex = regex.lastIndex - match[0].length;
    const len = match.length;
    for (let index = 0; index < len; index++) {
      allmatches.push(match[index]);
    }
    matches.push(allmatches);
    match = regex.exec(string);
  }
  return matches;
}
var isName = function(string) {
  const match = regexName.exec(string);
  return !(match === null || typeof match === "undefined");
};
function isExist(v) {
  return typeof v !== "undefined";
}
var DANGEROUS_PROPERTY_NAMES = [
  // '__proto__',
  // 'constructor',
  // 'prototype',
  "hasOwnProperty",
  "toString",
  "valueOf",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__"
];
var criticalProperties = ["__proto__", "constructor", "prototype"];

// ../node_modules/fast-xml-parser/src/validator.js
var defaultOptions = {
  allowBooleanAttributes: false,
  //A tag can have attributes without any value
  unpairedTags: []
};
function validate(xmlData, options) {
  options = Object.assign({}, defaultOptions, options);
  const tags = [];
  let tagFound = false;
  let reachedRoot = false;
  if (xmlData[0] === "\uFEFF") {
    xmlData = xmlData.substr(1);
  }
  for (let i = 0; i < xmlData.length; i++) {
    if (xmlData[i] === "<" && xmlData[i + 1] === "?") {
      i += 2;
      i = readPI(xmlData, i);
      if (i.err) return i;
    } else if (xmlData[i] === "<") {
      let tagStartPos = i;
      i++;
      if (xmlData[i] === "!") {
        i = readCommentAndCDATA(xmlData, i);
        continue;
      } else {
        let closingTag = false;
        if (xmlData[i] === "/") {
          closingTag = true;
          i++;
        }
        let tagName = "";
        for (; i < xmlData.length && xmlData[i] !== ">" && xmlData[i] !== " " && xmlData[i] !== "	" && xmlData[i] !== "\n" && xmlData[i] !== "\r"; i++) {
          tagName += xmlData[i];
        }
        tagName = tagName.trim();
        if (tagName[tagName.length - 1] === "/") {
          tagName = tagName.substring(0, tagName.length - 1);
          i--;
        }
        if (!validateTagName(tagName)) {
          let msg;
          if (tagName.trim().length === 0) {
            msg = "Invalid space after '<'.";
          } else {
            msg = "Tag '" + tagName + "' is an invalid name.";
          }
          return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i));
        }
        const result2 = readAttributeStr(xmlData, i);
        if (result2 === false) {
          return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
        }
        let attrStr = result2.value;
        i = result2.index;
        if (attrStr[attrStr.length - 1] === "/") {
          const attrStrStart = i - attrStr.length;
          attrStr = attrStr.substring(0, attrStr.length - 1);
          const isValid2 = validateAttributeString(attrStr, options);
          if (isValid2 === true) {
            tagFound = true;
          } else {
            return getErrorObject(isValid2.err.code, isValid2.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid2.err.line));
          }
        } else if (closingTag) {
          if (!result2.tagClosed) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
          } else if (attrStr.trim().length > 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
          } else if (tags.length === 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
          } else {
            const otg = tags.pop();
            if (tagName !== otg.tagName) {
              let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
              return getErrorObject(
                "InvalidTag",
                "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.",
                getLineNumberForPosition(xmlData, tagStartPos)
              );
            }
            if (tags.length == 0) {
              reachedRoot = true;
            }
          }
        } else {
          const isValid2 = validateAttributeString(attrStr, options);
          if (isValid2 !== true) {
            return getErrorObject(isValid2.err.code, isValid2.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid2.err.line));
          }
          if (reachedRoot === true) {
            return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i));
          } else if (options.unpairedTags.indexOf(tagName) !== -1) {
          } else {
            tags.push({ tagName, tagStartPos });
          }
          tagFound = true;
        }
        for (i++; i < xmlData.length; i++) {
          if (xmlData[i] === "<") {
            if (xmlData[i + 1] === "!") {
              i++;
              i = readCommentAndCDATA(xmlData, i);
              continue;
            } else if (xmlData[i + 1] === "?") {
              i = readPI(xmlData, ++i);
              if (i.err) return i;
            } else {
              break;
            }
          } else if (xmlData[i] === "&") {
            const afterAmp = validateAmpersand(xmlData, i);
            if (afterAmp == -1)
              return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
            i = afterAmp;
          } else {
            if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
              return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i));
            }
          }
        }
        if (xmlData[i] === "<") {
          i--;
        }
      }
    } else {
      if (isWhiteSpace(xmlData[i])) {
        continue;
      }
      return getErrorObject("InvalidChar", "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
    }
  }
  if (!tagFound) {
    return getErrorObject("InvalidXml", "Start tag expected.", 1);
  } else if (tags.length == 1) {
    return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
  } else if (tags.length > 0) {
    return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t) => t.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
  }
  return true;
}
function isWhiteSpace(char) {
  return char === " " || char === "	" || char === "\n" || char === "\r";
}
function readPI(xmlData, i) {
  const start = i;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] == "?" || xmlData[i] == " ") {
      const tagname = xmlData.substr(start, i - start);
      if (i > 5 && tagname === "xml") {
        return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i));
      } else if (xmlData[i] == "?" && xmlData[i + 1] == ">") {
        i++;
        break;
      } else {
        continue;
      }
    }
  }
  return i;
}
function readCommentAndCDATA(xmlData, i) {
  if (xmlData.length > i + 5 && xmlData[i + 1] === "-" && xmlData[i + 2] === "-") {
    for (i += 3; i < xmlData.length; i++) {
      if (xmlData[i] === "-" && xmlData[i + 1] === "-" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  } else if (xmlData.length > i + 8 && xmlData[i + 1] === "D" && xmlData[i + 2] === "O" && xmlData[i + 3] === "C" && xmlData[i + 4] === "T" && xmlData[i + 5] === "Y" && xmlData[i + 6] === "P" && xmlData[i + 7] === "E") {
    let angleBracketsCount = 1;
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === "<") {
        angleBracketsCount++;
      } else if (xmlData[i] === ">") {
        angleBracketsCount--;
        if (angleBracketsCount === 0) {
          break;
        }
      }
    }
  } else if (xmlData.length > i + 9 && xmlData[i + 1] === "[" && xmlData[i + 2] === "C" && xmlData[i + 3] === "D" && xmlData[i + 4] === "A" && xmlData[i + 5] === "T" && xmlData[i + 6] === "A" && xmlData[i + 7] === "[") {
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === "]" && xmlData[i + 1] === "]" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  }
  return i;
}
var doubleQuote = '"';
var singleQuote = "'";
function readAttributeStr(xmlData, i) {
  let attrStr = "";
  let startChar = "";
  let tagClosed = false;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
      if (startChar === "") {
        startChar = xmlData[i];
      } else if (startChar !== xmlData[i]) {
      } else {
        startChar = "";
      }
    } else if (xmlData[i] === ">") {
      if (startChar === "") {
        tagClosed = true;
        break;
      }
    }
    attrStr += xmlData[i];
  }
  if (startChar !== "") {
    return false;
  }
  return {
    value: attrStr,
    index: i,
    tagClosed
  };
}
var validAttrStrRegxp = new RegExp(`(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['"])(([\\s\\S])*?)\\5)?`, "g");
function validateAttributeString(attrStr, options) {
  const matches = getAllMatches(attrStr, validAttrStrRegxp);
  const attrNames = {};
  for (let i = 0; i < matches.length; i++) {
    if (matches[i][1].length === 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] !== void 0 && matches[i][4] === void 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] === void 0 && !options.allowBooleanAttributes) {
      return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
    }
    const attrName = matches[i][2];
    if (!validateAttrName(attrName)) {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
    }
    if (!Object.prototype.hasOwnProperty.call(attrNames, attrName)) {
      attrNames[attrName] = 1;
    } else {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
    }
  }
  return true;
}
function validateNumberAmpersand(xmlData, i) {
  let re = /\d/;
  if (xmlData[i] === "x") {
    i++;
    re = /[\da-fA-F]/;
  }
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === ";")
      return i;
    if (!xmlData[i].match(re))
      break;
  }
  return -1;
}
function validateAmpersand(xmlData, i) {
  i++;
  if (xmlData[i] === ";")
    return -1;
  if (xmlData[i] === "#") {
    i++;
    return validateNumberAmpersand(xmlData, i);
  }
  let count = 0;
  for (; i < xmlData.length; i++, count++) {
    if (xmlData[i].match(/\w/) && count < 20)
      continue;
    if (xmlData[i] === ";")
      break;
    return -1;
  }
  return i;
}
function getErrorObject(code, message, lineNumber) {
  return {
    err: {
      code,
      msg: message,
      line: lineNumber.line || lineNumber,
      col: lineNumber.col
    }
  };
}
function validateAttrName(attrName) {
  return isName(attrName);
}
function validateTagName(tagname) {
  return isName(tagname);
}
function getLineNumberForPosition(xmlData, index) {
  const lines = xmlData.substring(0, index).split(/\r?\n/);
  return {
    line: lines.length,
    // column number is last line's length + 1, because column numbering starts at 1:
    col: lines[lines.length - 1].length + 1
  };
}
function getPositionFromMatch(match) {
  return match.startIndex + match[1].length;
}

// ../node_modules/@nodable/entities/src/entities.js
var CURRENCY = {
  cent: "\xA2",
  pound: "\xA3",
  curren: "\xA4",
  yen: "\xA5",
  euro: "\u20AC",
  dollar: "$",
  fnof: "\u0192",
  inr: "\u20B9",
  af: "\u060B",
  birr: "\u1265\u122D",
  peso: "\u20B1",
  rub: "\u20BD",
  won: "\u20A9",
  yuan: "\xA5",
  cedil: "\xB8"
};
var XML = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"'
};
var COMMON_HTML = {
  nbsp: "\xA0",
  copy: "\xA9",
  reg: "\xAE",
  trade: "\u2122",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  laquo: "\xAB",
  raquo: "\xBB",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  bull: "\u2022",
  para: "\xB6",
  sect: "\xA7",
  deg: "\xB0",
  frac12: "\xBD",
  frac14: "\xBC",
  frac34: "\xBE"
};

// ../node_modules/@nodable/entities/src/EntityDecoder.js
var ENTITY_ACTION = Object.freeze({
  /** Resolve and expand the entity normally. */
  ALLOW: "allow",
  /** Silently skip this entity — it will not be registered. */
  BLOCK: "block",
  /** Throw an error, aborting entity registration entirely. */
  THROW: "throw"
});
var SPECIAL_CHARS = new Set("!?\\\\/[]$%{}^&*()<>|+");
function validateEntityName(name) {
  if (name[0] === "#") {
    throw new Error(`[EntityReplacer] Invalid character '#' in entity name: "${name}"`);
  }
  for (const ch of name) {
    if (SPECIAL_CHARS.has(ch)) {
      throw new Error(`[EntityReplacer] Invalid character '${ch}' in entity name: "${name}"`);
    }
  }
  return name;
}
function mergeEntityMaps(...maps) {
  const out = /* @__PURE__ */ Object.create(null);
  for (const map of maps) {
    if (!map) continue;
    for (const key2 of Object.keys(map)) {
      const raw = map[key2];
      if (typeof raw === "string") {
        out[key2] = raw;
      } else if (raw && typeof raw === "object" && raw.val !== void 0) {
        const val = raw.val;
        if (typeof val === "string") {
          out[key2] = val;
        }
      }
    }
  }
  return out;
}
var LIMIT_TIER_EXTERNAL = "external";
var LIMIT_TIER_BASE = "base";
var LIMIT_TIER_ALL = "all";
function parseLimitTiers(raw) {
  if (!raw || raw === LIMIT_TIER_EXTERNAL) return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
  if (raw === LIMIT_TIER_ALL) return /* @__PURE__ */ new Set([LIMIT_TIER_ALL]);
  if (raw === LIMIT_TIER_BASE) return /* @__PURE__ */ new Set([LIMIT_TIER_BASE]);
  if (Array.isArray(raw)) return new Set(raw);
  return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
}
var NCR_LEVEL = Object.freeze({ allow: 0, leave: 1, remove: 2, throw: 3 });
var XML10_ALLOWED_C0 = /* @__PURE__ */ new Set([9, 10, 13]);
function parseNCRConfig(ncr) {
  if (!ncr) {
    return { xmlVersion: 1, onLevel: NCR_LEVEL.allow, nullLevel: NCR_LEVEL.remove };
  }
  const xmlVersion = ncr.xmlVersion === 1.1 ? 1.1 : 1;
  const onLevel = NCR_LEVEL[ncr.onNCR] ?? NCR_LEVEL.allow;
  const nullLevel = NCR_LEVEL[ncr.nullNCR] ?? NCR_LEVEL.remove;
  const clampedNull = Math.max(nullLevel, NCR_LEVEL.remove);
  return { xmlVersion, onLevel, nullLevel: clampedNull };
}
var EntityDecoder = class {
  /**
   * @param {object} [options]
   * @param {object|null}  [options.namedEntities]        — extra named entities merged into base map
   * @param {object}  [options.limit]                 — security limits
   * @param {number}       [options.limit.maxTotalExpansions=0]  — 0 = unlimited
   * @param {number}       [options.limit.maxExpandedLength=0]   — 0 = unlimited
   * @param {'external'|'base'|'all'|string[]} [options.limit.applyLimitsTo='external']
   *   Which entity tiers count against the security limits:
   *   - 'external' (default) — only input/runtime + persistent external entities
   *   - 'base'               — only DEFAULT_XML_ENTITIES + namedEntities
   *   - 'all'                — every entity regardless of tier
   *   - string[]             — explicit combination, e.g. ['external', 'base']
   * @param {((resolved: string, original: string) => string)|null} [options.postCheck=null]
   * @param {string[]} [options.remove=[]] — entity names (e.g. ['nbsp', '#13']) to delete (replace with empty string)
   * @param {string[]} [options.leave=[]]  — entity names to keep as literal (unchanged in output)
   * @param {object}   [options.ncr]       — Numeric Character Reference controls
   * @param {1.0|1.1}  [options.ncr.xmlVersion=1.0]
   *   XML version governing which codepoint ranges are restricted:
   *   - 1.0 — C0 controls U+0001–U+001F (except U+0009/000A/000D) are prohibited
   *   - 1.1 — C0 controls are allowed when written as NCRs; C1 (U+007F–U+009F) decoded as-is
   * @param {'allow'|'leave'|'remove'|'throw'} [options.ncr.onNCR='allow']
   *   Base action for numeric references. Severity order: allow < leave < remove < throw.
   *   For codepoint ranges that carry a minimum level (surrogates → remove, XML 1.0 C0 → remove),
   *   the effective action is max(onNCR, rangeMinimum).
   * @param {'remove'|'throw'} [options.ncr.nullNCR='remove']
   *   Action for U+0000 (null). 'allow' and 'leave' are clamped to 'remove' since null is never safe.
   * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onExternalEntity=null]
   *   Hook called when an external entity is registered via `setExternalEntities()` or
   *   `addExternalEntity()`. Return `ENTITY_ACTION.ALLOW` to accept the entity,
   *   `ENTITY_ACTION.BLOCK` to silently skip it, or `ENTITY_ACTION.THROW` to abort with an error.
   * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onInputEntity=null]
   *   Hook called when an input entity is registered via `addInputEntities()`. Return
   *   `ENTITY_ACTION.ALLOW` to accept, `ENTITY_ACTION.BLOCK` to silently skip, or
   *   `ENTITY_ACTION.THROW` to abort with an error.
   */
  constructor(options = {}) {
    this._limit = options.limit || {};
    this._maxTotalExpansions = this._limit.maxTotalExpansions || 0;
    this._maxExpandedLength = this._limit.maxExpandedLength || 0;
    this._postCheck = typeof options.postCheck === "function" ? options.postCheck : (r) => r;
    this._limitTiers = parseLimitTiers(this._limit.applyLimitsTo ?? LIMIT_TIER_EXTERNAL);
    this._numericAllowed = options.numericAllowed ?? true;
    this._baseMap = mergeEntityMaps(XML, options.namedEntities || null);
    this._externalMap = /* @__PURE__ */ Object.create(null);
    this._inputMap = /* @__PURE__ */ Object.create(null);
    this._totalExpansions = 0;
    this._expandedLength = 0;
    this._removeSet = new Set(options.remove && Array.isArray(options.remove) ? options.remove : []);
    this._leaveSet = new Set(options.leave && Array.isArray(options.leave) ? options.leave : []);
    const ncrCfg = parseNCRConfig(options.ncr);
    this._ncrXmlVersion = ncrCfg.xmlVersion;
    this._ncrOnLevel = ncrCfg.onLevel;
    this._ncrNullLevel = ncrCfg.nullLevel;
    this._onExternalEntity = typeof options.onExternalEntity === "function" ? options.onExternalEntity : null;
    this._onInputEntity = typeof options.onInputEntity === "function" ? options.onInputEntity : null;
  }
  // -------------------------------------------------------------------------
  // Private: registration hook dispatch
  // -------------------------------------------------------------------------
  /**
   * Invoke a registration hook for a single entity name/value pair.
   * Returns true when the entity should be accepted, false when it should be
   * silently skipped (BLOCK), and throws when the hook returns THROW.
   *
   * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} hook
   * @param {string} name
   * @param {string} value
   * @param {string} context  — used in error messages ('external' | 'input')
   * @returns {boolean}  true = accept, false = skip
   */
  _applyRegistrationHook(hook, name, value, context) {
    if (!hook) return true;
    const action = hook(name, value);
    if (action === ENTITY_ACTION.BLOCK) return false;
    if (action === ENTITY_ACTION.THROW) {
      throw new Error(
        `[EntityDecoder] Registration of ${context} entity "&${name};" was rejected by hook`
      );
    }
    return true;
  }
  // -------------------------------------------------------------------------
  // Persistent external entity registration
  // -------------------------------------------------------------------------
  /**
   * Replace the full set of persistent external entities.
   * All keys are validated — throws on invalid characters.
   * If `onExternalEntity` is set, it is called once per entry; entries that
   * return `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW`
   * aborts the whole call.
   * @param {Record<string, string | { regex?: RegExp, val: string }>} map
   */
  setExternalEntities(map) {
    if (map) {
      for (const key2 of Object.keys(map)) {
        validateEntityName(key2);
      }
    }
    if (!this._onExternalEntity) {
      this._externalMap = mergeEntityMaps(map);
      return;
    }
    const flat = mergeEntityMaps(map);
    const filtered = /* @__PURE__ */ Object.create(null);
    for (const [name, value] of Object.entries(flat)) {
      if (this._applyRegistrationHook(this._onExternalEntity, name, value, "external")) {
        filtered[name] = value;
      }
    }
    this._externalMap = filtered;
  }
  /**
   * Add a single persistent external entity.
   * If `onExternalEntity` is set it is called before the entity is stored;
   * `ENTITY_ACTION.BLOCK` silently skips storage, `ENTITY_ACTION.THROW` raises.
   * @param {string} key
   * @param {string} value
   */
  addExternalEntity(key2, value) {
    validateEntityName(key2);
    if (typeof value === "string" && value.indexOf("&") === -1) {
      if (this._applyRegistrationHook(this._onExternalEntity, key2, value, "external")) {
        this._externalMap[key2] = value;
      }
    }
  }
  // -------------------------------------------------------------------------
  // Input / runtime entity registration (per document)
  // -------------------------------------------------------------------------
  /**
   * Inject DOCTYPE entities for the current document.
   * Also resets per-document expansion counters.
   * If `onInputEntity` is set it is called once per entry; entries returning
   * `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW` aborts.
   * @param {Record<string, string | { regx?: RegExp, regex?: RegExp, val: string }>} map
   */
  addInputEntities(map) {
    this._totalExpansions = 0;
    this._expandedLength = 0;
    if (!this._onInputEntity) {
      this._inputMap = mergeEntityMaps(map);
      return;
    }
    const flat = mergeEntityMaps(map);
    const filtered = /* @__PURE__ */ Object.create(null);
    for (const [name, value] of Object.entries(flat)) {
      if (this._applyRegistrationHook(this._onInputEntity, name, value, "input")) {
        filtered[name] = value;
      }
    }
    this._inputMap = filtered;
  }
  // -------------------------------------------------------------------------
  // Per-document reset
  // -------------------------------------------------------------------------
  /**
   * Wipe input/runtime entities and reset counters.
   * Call this before processing each new document.
   * @returns {this}
   */
  reset() {
    this._inputMap = /* @__PURE__ */ Object.create(null);
    this._totalExpansions = 0;
    this._expandedLength = 0;
    return this;
  }
  // -------------------------------------------------------------------------
  // XML version (can be set after construction, e.g. once parser reads <?xml?>)
  // -------------------------------------------------------------------------
  /**
   * Update the XML version used for NCR classification.
   * Call this as soon as the document's `<?xml version="...">` declaration is parsed.
   * @param {1.0|1.1|number} version
   */
  setXmlVersion(version) {
    this._ncrXmlVersion = version === 1.1 ? 1.1 : 1;
  }
  // -------------------------------------------------------------------------
  // Primary API
  // -------------------------------------------------------------------------
  /**
   * Replace all entity references in `str` in a single pass.
   *
   * @param {string} str
   * @returns {string}
   */
  decode(str) {
    if (typeof str !== "string" || str.length === 0) return str;
    if (str.indexOf("&") === -1) return str;
    const original = str;
    const chunks = [];
    const len = str.length;
    let last = 0;
    let i = 0;
    const limitExpansions = this._maxTotalExpansions > 0;
    const limitLength = this._maxExpandedLength > 0;
    const checkLimits = limitExpansions || limitLength;
    while (i < len) {
      if (str.charCodeAt(i) !== 38) {
        i++;
        continue;
      }
      let j = i + 1;
      while (j < len && str.charCodeAt(j) !== 59 && j - i <= 32) j++;
      if (j >= len || str.charCodeAt(j) !== 59) {
        i++;
        continue;
      }
      const token = str.slice(i + 1, j);
      if (token.length === 0) {
        i++;
        continue;
      }
      let replacement;
      let tier;
      if (this._removeSet.has(token)) {
        replacement = "";
        if (tier === void 0) {
          tier = LIMIT_TIER_EXTERNAL;
        }
      } else if (this._leaveSet.has(token)) {
        i++;
        continue;
      } else if (token.charCodeAt(0) === 35) {
        const ncrResult = this._resolveNCR(token);
        if (ncrResult === void 0) {
          i++;
          continue;
        }
        replacement = ncrResult;
        tier = LIMIT_TIER_BASE;
      } else {
        const resolved = this._resolveName(token);
        replacement = resolved?.value;
        tier = resolved?.tier;
      }
      if (replacement === void 0) {
        i++;
        continue;
      }
      if (i > last) chunks.push(str.slice(last, i));
      chunks.push(replacement);
      last = j + 1;
      i = last;
      if (checkLimits && this._tierCounts(tier)) {
        if (limitExpansions) {
          this._totalExpansions++;
          if (this._totalExpansions > this._maxTotalExpansions) {
            throw new Error(
              `[EntityReplacer] Entity expansion count limit exceeded: ${this._totalExpansions} > ${this._maxTotalExpansions}`
            );
          }
        }
        if (limitLength) {
          const delta = replacement.length - (token.length + 2);
          if (delta > 0) {
            this._expandedLength += delta;
            if (this._expandedLength > this._maxExpandedLength) {
              throw new Error(
                `[EntityReplacer] Expanded content length limit exceeded: ${this._expandedLength} > ${this._maxExpandedLength}`
              );
            }
          }
        }
      }
    }
    if (last < len) chunks.push(str.slice(last));
    const result2 = chunks.length === 0 ? str : chunks.join("");
    return this._postCheck(result2, original);
  }
  // -------------------------------------------------------------------------
  // Private: limit tier check
  // -------------------------------------------------------------------------
  /**
   * Returns true if a resolved entity of the given tier should count
   * against the expansion/length limits.
   * @param {string} tier  — LIMIT_TIER_EXTERNAL | LIMIT_TIER_BASE
   * @returns {boolean}
   */
  _tierCounts(tier) {
    if (this._limitTiers.has(LIMIT_TIER_ALL)) return true;
    return this._limitTiers.has(tier);
  }
  // -------------------------------------------------------------------------
  // Private: entity resolution
  // -------------------------------------------------------------------------
  /**
   * Resolve a named entity token (without & and ;).
   * Priority: inputMap > externalMap > baseMap
   * Returns the resolved value tagged with its limit tier.
   *
   * @param {string} name
   * @returns {{ value: string, tier: string }|undefined}
   */
  _resolveName(name) {
    if (name in this._inputMap) return { value: this._inputMap[name], tier: LIMIT_TIER_EXTERNAL };
    if (name in this._externalMap) return { value: this._externalMap[name], tier: LIMIT_TIER_EXTERNAL };
    if (name in this._baseMap) return { value: this._baseMap[name], tier: LIMIT_TIER_BASE };
    return void 0;
  }
  /**
   * Classify a codepoint and return the minimum action level that must be applied.
   * Returns -1 when no minimum is imposed (normal allow path).
   *
   * Ranges checked (in priority order):
   *   1. U+0000            — null, governed by nullNCR (always ≥ remove)
   *   2. U+D800–U+DFFF     — surrogates, always prohibited (min: remove)
   *   3. U+0001–U+001F \ {0x09,0x0A,0x0D}  — XML 1.0 restricted C0 (min: remove)
   *      (skipped in XML 1.1 — C0 controls are allowed when written as NCRs)
   *
   * @param {number} cp  — codepoint
   * @returns {number}   — minimum NCR_LEVEL value, or -1 for no restriction
   */
  _classifyNCR(cp) {
    if (cp === 0) return this._ncrNullLevel;
    if (cp >= 55296 && cp <= 57343) return NCR_LEVEL.remove;
    if (this._ncrXmlVersion === 1) {
      if (cp >= 1 && cp <= 31 && !XML10_ALLOWED_C0.has(cp)) return NCR_LEVEL.remove;
    }
    return -1;
  }
  /**
   * Execute a resolved NCR action.
   *
   * @param {number} action   — NCR_LEVEL value
   * @param {string} token    — raw token (e.g. '#38') for error messages
   * @param {number} cp       — codepoint, used only for error messages
   * @returns {string|undefined}
   *   - decoded character string  → 'allow'
   *   - ''                        → 'remove'
   *   - undefined                 → 'leave' (caller must skip past '&' only)
   *   - throws Error              → 'throw'
   */
  _applyNCRAction(action, token, cp) {
    switch (action) {
      case NCR_LEVEL.allow:
        return String.fromCodePoint(cp);
      case NCR_LEVEL.remove:
        return "";
      case NCR_LEVEL.leave:
        return void 0;
      // signal: keep literal
      case NCR_LEVEL.throw:
        throw new Error(
          `[EntityDecoder] Prohibited numeric character reference &${token}; (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`
        );
      default:
        return String.fromCodePoint(cp);
    }
  }
  /**
   * Full NCR resolution pipeline for a numeric token.
   *
   * Steps:
   *   1. Parse the codepoint (decimal or hex).
   *   2. Validate the raw codepoint range (NaN, <0, >0x10FFFF).
   *   3. If numericAllowed is false and no minimum restriction applies → leave as-is.
   *   4. Classify the codepoint to find the minimum required action level.
   *   5. Resolve effective action = max(onNCR, minimum).
   *   6. Apply and return.
   *
   * @param {string} token  — e.g. '#38', '#x26', '#X26'
   * @returns {string|undefined}
   *   - string (incl. '')  — replacement ('' = remove)
   *   - undefined          — leave original &token; as-is
   */
  _resolveNCR(token) {
    const second = token.charCodeAt(1);
    let cp;
    if (second === 120 || second === 88) {
      cp = parseInt(token.slice(2), 16);
    } else {
      cp = parseInt(token.slice(1), 10);
    }
    if (Number.isNaN(cp) || cp < 0 || cp > 1114111) return void 0;
    const minimum = this._classifyNCR(cp);
    if (!this._numericAllowed && minimum < NCR_LEVEL.remove) return void 0;
    const effective = minimum === -1 ? this._ncrOnLevel : Math.max(this._ncrOnLevel, minimum);
    return this._applyNCRAction(effective, token, cp);
  }
};

// ../node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js
var defaultOnDangerousProperty = (name) => {
  if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return "__" + name;
  }
  return name;
};
var defaultOptions2 = {
  preserveOrder: false,
  attributeNamePrefix: "@_",
  attributesGroupName: false,
  textNodeName: "#text",
  ignoreAttributes: true,
  removeNSPrefix: false,
  // remove NS from tag name or attribute name if true
  allowBooleanAttributes: false,
  //a tag can have attributes without any value
  //ignoreRootElement : false,
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true,
  //Trim string values of tag and attributes
  cdataPropName: false,
  numberParseOptions: {
    hex: true,
    leadingZeros: true,
    eNotation: true,
    unicode: false
  },
  tagValueProcessor: function(tagName, val) {
    return val;
  },
  attributeValueProcessor: function(attrName, val) {
    return val;
  },
  stopNodes: [],
  //nested tags will not be parsed even for errors
  alwaysCreateTextNode: false,
  isArray: () => false,
  commentPropName: false,
  unpairedTags: [],
  processEntities: true,
  htmlEntities: false,
  entityDecoder: null,
  ignoreDeclaration: false,
  ignorePiTags: false,
  transformTagName: false,
  transformAttributeName: false,
  updateTag: function(tagName, jPath, attrs) {
    return tagName;
  },
  // skipEmptyListItem: false
  captureMetaData: false,
  maxNestedTags: 100,
  strictReservedNames: true,
  jPath: true,
  // if true, pass jPath string to callbacks; if false, pass matcher instance
  onDangerousProperty: defaultOnDangerousProperty
};
function validatePropertyName(propertyName, optionName) {
  if (typeof propertyName !== "string") {
    return;
  }
  const normalized = propertyName.toLowerCase();
  if (DANGEROUS_PROPERTY_NAMES.some((dangerous) => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }
  if (criticalProperties.some((dangerous) => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }
}
function normalizeProcessEntities(value, htmlEntities) {
  if (typeof value === "boolean") {
    return {
      enabled: value,
      // true or false
      maxEntitySize: 1e4,
      maxExpansionDepth: 1e4,
      maxTotalExpansions: Infinity,
      maxExpandedLength: 1e5,
      maxEntityCount: 1e3,
      allowedTags: null,
      tagFilter: null,
      appliesTo: "all"
    };
  }
  if (typeof value === "object" && value !== null) {
    return {
      enabled: value.enabled !== false,
      maxEntitySize: Math.max(1, value.maxEntitySize ?? 1e4),
      maxExpansionDepth: Math.max(1, value.maxExpansionDepth ?? 1e4),
      maxTotalExpansions: Math.max(1, value.maxTotalExpansions ?? Infinity),
      maxExpandedLength: Math.max(1, value.maxExpandedLength ?? 1e5),
      maxEntityCount: Math.max(1, value.maxEntityCount ?? 1e3),
      allowedTags: value.allowedTags ?? null,
      tagFilter: value.tagFilter ?? null,
      appliesTo: value.appliesTo ?? "all"
    };
  }
  return normalizeProcessEntities(true);
}
var buildOptions = function(options) {
  const built = Object.assign({}, defaultOptions2, options);
  const propertyNameOptions = [
    { value: built.attributeNamePrefix, name: "attributeNamePrefix" },
    { value: built.attributesGroupName, name: "attributesGroupName" },
    { value: built.textNodeName, name: "textNodeName" },
    { value: built.cdataPropName, name: "cdataPropName" },
    { value: built.commentPropName, name: "commentPropName" }
  ];
  for (const { value, name } of propertyNameOptions) {
    if (value) {
      validatePropertyName(value, name);
    }
  }
  if (built.onDangerousProperty === null) {
    built.onDangerousProperty = defaultOnDangerousProperty;
  }
  built.processEntities = normalizeProcessEntities(built.processEntities, built.htmlEntities);
  built.unpairedTagsSet = new Set(built.unpairedTags);
  if (built.stopNodes && Array.isArray(built.stopNodes)) {
    built.stopNodes = built.stopNodes.map((node) => {
      if (typeof node === "string" && node.startsWith("*.")) {
        return ".." + node.substring(2);
      }
      return node;
    });
  }
  return built;
};

// ../node_modules/fast-xml-parser/src/xmlparser/xmlNode.js
var METADATA_SYMBOL;
if (typeof Symbol !== "function") {
  METADATA_SYMBOL = "@@xmlMetadata";
} else {
  METADATA_SYMBOL = Symbol("XML Node Metadata");
}
var XmlNode = class {
  constructor(tagname) {
    this.tagname = tagname;
    this.child = [];
    this[":@"] = /* @__PURE__ */ Object.create(null);
  }
  add(key2, val) {
    if (key2 === "__proto__") key2 = "#__proto__";
    this.child.push({ [key2]: val });
  }
  addChild(node, startIndex) {
    if (node.tagname === "__proto__") node.tagname = "#__proto__";
    if (node[":@"] && Object.keys(node[":@"]).length > 0) {
      this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
    } else {
      this.child.push({ [node.tagname]: node.child });
    }
    if (startIndex !== void 0) {
      this.child[this.child.length - 1][METADATA_SYMBOL] = { startIndex };
    }
  }
  /** symbol used for metadata */
  static getMetaDataSymbol() {
    return METADATA_SYMBOL;
  }
};

// ../node_modules/xml-naming/src/index.js
var nameStartChar10 = ":A-Za-z_\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u0486\u0488-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD";
var nameChar10 = nameStartChar10 + "\\-\\.\\d\xB7\u0300-\u036F\u203F-\u2040";
var nameStartChar11 = ":A-Za-z_\xC0-\u02FF\u0370-\u037D\u037F-\u0486\u0488-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}";
var nameChar11 = nameStartChar11 + "\\-\\.\\d\xB7\u0300-\u036F\u0487\u203F-\u2040";
var buildRegexes = (startChar, char, flags = "") => {
  const ncStart = startChar.replace(":", "");
  const ncChar = char.replace(":", "");
  const ncNamePat = `[${ncStart}][${ncChar}]*`;
  return {
    name: new RegExp(`^[${startChar}][${char}]*$`, flags),
    ncName: new RegExp(`^${ncNamePat}$`, flags),
    qName: new RegExp(`^${ncNamePat}(?::${ncNamePat})?$`, flags),
    nmToken: new RegExp(`^[${char}]+$`, flags),
    nmTokens: new RegExp(`^[${char}]+(?:\\s+[${char}]+)*$`, flags)
  };
};
var regexes10 = buildRegexes(nameStartChar10, nameChar10);
var regexes11 = buildRegexes(nameStartChar11, nameChar11, "u");
var nameStartCharAscii = ":A-Za-z_";
var nameCharAscii = nameStartCharAscii + "\\-\\.\\d";
var regexesAscii = buildRegexes(nameStartCharAscii, nameCharAscii);
var getRegexes = (xmlVersion = "1.0", asciiOnly = false) => {
  if (asciiOnly) return regexesAscii;
  return xmlVersion === "1.1" ? regexes11 : regexes10;
};
var qName = (str, { xmlVersion = "1.0", asciiOnly = false } = {}) => getRegexes(xmlVersion, asciiOnly).qName.test(str);

// ../node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js
var DocTypeReader = class {
  constructor(options, xmlVersion) {
    this.suppressValidationErr = !options;
    this.options = options;
    this.xmlVersion = xmlVersion || 1;
  }
  setXmlVersion(xmlVersion = 1) {
    this.xmlVersion = xmlVersion;
  }
  readDocType(xmlData, i) {
    const entities = /* @__PURE__ */ Object.create(null);
    let entityCount = 0;
    if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
      i = i + 9;
      let angleBracketsCount = 1;
      let hasBody = false, comment = false;
      let exp = "";
      for (; i < xmlData.length; i++) {
        if (xmlData[i] === "<" && !comment) {
          if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
            i += 7;
            let entityName, val;
            [entityName, val, i] = this.readEntityExp(xmlData, i + 1, this.suppressValidationErr);
            if (val.indexOf("&") === -1) {
              if (this.options.enabled !== false && this.options.maxEntityCount != null && entityCount >= this.options.maxEntityCount) {
                throw new Error(
                  `Entity count (${entityCount + 1}) exceeds maximum allowed (${this.options.maxEntityCount})`
                );
              }
              entities[entityName] = val;
              entityCount++;
            }
          } else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
            i += 8;
            const { index } = this.readElementExp(xmlData, i + 1);
            i = index;
          } else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) {
            i += 8;
          } else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
            i += 9;
            const { index } = this.readNotationExp(xmlData, i + 1, this.suppressValidationErr);
            i = index;
          } else if (hasSeq(xmlData, "!--", i)) comment = true;
          else throw new Error(`Invalid DOCTYPE`);
          angleBracketsCount++;
          exp = "";
        } else if (xmlData[i] === ">") {
          if (comment) {
            if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
              comment = false;
              angleBracketsCount--;
            }
          } else {
            angleBracketsCount--;
          }
          if (angleBracketsCount === 0) {
            break;
          }
        } else if (xmlData[i] === "[") {
          hasBody = true;
        } else {
          exp += xmlData[i];
        }
      }
      if (angleBracketsCount !== 0) {
        throw new Error(`Unclosed DOCTYPE`);
      }
    } else {
      throw new Error(`Invalid Tag instead of DOCTYPE`);
    }
    return { entities, i };
  }
  readEntityExp(xmlData, i) {
    i = skipWhitespace(xmlData, i);
    const startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== '"' && xmlData[i] !== "'") {
      i++;
    }
    let entityName = xmlData.substring(startIndex, i);
    validateEntityName2(entityName, { xmlVersion: this.xmlVersion });
    i = skipWhitespace(xmlData, i);
    if (!this.suppressValidationErr) {
      if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") {
        throw new Error("External entities are not supported");
      } else if (xmlData[i] === "%") {
        throw new Error("Parameter entities are not supported");
      }
    }
    let entityValue = "";
    [i, entityValue] = this.readIdentifierVal(xmlData, i, "entity");
    if (this.options.enabled !== false && this.options.maxEntitySize != null && entityValue.length > this.options.maxEntitySize) {
      throw new Error(
        `Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`
      );
    }
    i--;
    return [entityName, entityValue, i];
  }
  readNotationExp(xmlData, i) {
    i = skipWhitespace(xmlData, i);
    const startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i])) {
      i++;
    }
    let notationName = xmlData.substring(startIndex, i);
    !this.suppressValidationErr && validateEntityName2(notationName, { xmlVersion: this.xmlVersion });
    i = skipWhitespace(xmlData, i);
    const identifierType = xmlData.substring(i, i + 6).toUpperCase();
    if (!this.suppressValidationErr && identifierType !== "SYSTEM" && identifierType !== "PUBLIC") {
      throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
    }
    i += identifierType.length;
    i = skipWhitespace(xmlData, i);
    let publicIdentifier = null;
    let systemIdentifier = null;
    if (identifierType === "PUBLIC") {
      [i, publicIdentifier] = this.readIdentifierVal(xmlData, i, "publicIdentifier");
      i = skipWhitespace(xmlData, i);
      if (xmlData[i] === '"' || xmlData[i] === "'") {
        [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
      }
    } else if (identifierType === "SYSTEM") {
      [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
      if (!this.suppressValidationErr && !systemIdentifier) {
        throw new Error("Missing mandatory system identifier for SYSTEM notation");
      }
    }
    return { notationName, publicIdentifier, systemIdentifier, index: --i };
  }
  readIdentifierVal(xmlData, i, type) {
    let identifierVal = "";
    const startChar = xmlData[i];
    if (startChar !== '"' && startChar !== "'") {
      throw new Error(`Expected quoted string, found "${startChar}"`);
    }
    i++;
    const startIndex = i;
    while (i < xmlData.length && xmlData[i] !== startChar) {
      i++;
    }
    identifierVal = xmlData.substring(startIndex, i);
    if (xmlData[i] !== startChar) {
      throw new Error(`Unterminated ${type} value`);
    }
    i++;
    return [i, identifierVal];
  }
  readElementExp(xmlData, i) {
    i = skipWhitespace(xmlData, i);
    const startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i])) {
      i++;
    }
    let elementName = xmlData.substring(startIndex, i);
    if (!this.suppressValidationErr && !qName(elementName, { xmlVersion: this.xmlVersion })) {
      throw new Error(`Invalid element name: "${elementName}"`);
    }
    i = skipWhitespace(xmlData, i);
    let contentModel = "";
    if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i)) i += 4;
    else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i)) i += 2;
    else if (xmlData[i] === "(") {
      i++;
      const startIndex2 = i;
      while (i < xmlData.length && xmlData[i] !== ")") {
        i++;
      }
      contentModel = xmlData.substring(startIndex2, i);
      if (xmlData[i] !== ")") {
        throw new Error("Unterminated content model");
      }
    } else if (!this.suppressValidationErr) {
      throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
    }
    return {
      elementName,
      contentModel: contentModel.trim(),
      index: i
    };
  }
  readAttlistExp(xmlData, i) {
    i = skipWhitespace(xmlData, i);
    let startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i])) {
      i++;
    }
    let elementName = xmlData.substring(startIndex, i);
    validateEntityName2(elementName, { xmlVersion: this.xmlVersion });
    i = skipWhitespace(xmlData, i);
    startIndex = i;
    while (i < xmlData.length && !/\s/.test(xmlData[i])) {
      i++;
    }
    let attributeName = xmlData.substring(startIndex, i);
    if (!validateEntityName2(attributeName, { xmlVersion: this.xmlVersion })) {
      throw new Error(`Invalid attribute name: "${attributeName}"`);
    }
    i = skipWhitespace(xmlData, i);
    let attributeType = "";
    if (xmlData.substring(i, i + 8).toUpperCase() === "NOTATION") {
      attributeType = "NOTATION";
      i += 8;
      i = skipWhitespace(xmlData, i);
      if (xmlData[i] !== "(") {
        throw new Error(`Expected '(', found "${xmlData[i]}"`);
      }
      i++;
      let allowedNotations = [];
      while (i < xmlData.length && xmlData[i] !== ")") {
        const startIndex2 = i;
        while (i < xmlData.length && xmlData[i] !== "|" && xmlData[i] !== ")") {
          i++;
        }
        let notation = xmlData.substring(startIndex2, i);
        notation = notation.trim();
        if (!validateEntityName2(notation, { xmlVersion: this.xmlVersion })) {
          throw new Error(`Invalid notation name: "${notation}"`);
        }
        allowedNotations.push(notation);
        if (xmlData[i] === "|") {
          i++;
          i = skipWhitespace(xmlData, i);
        }
      }
      if (xmlData[i] !== ")") {
        throw new Error("Unterminated list of notations");
      }
      i++;
      attributeType += " (" + allowedNotations.join("|") + ")";
    } else {
      const startIndex2 = i;
      while (i < xmlData.length && !/\s/.test(xmlData[i])) {
        i++;
      }
      attributeType += xmlData.substring(startIndex2, i);
      const validTypes = ["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"];
      if (!this.suppressValidationErr && !validTypes.includes(attributeType.toUpperCase())) {
        throw new Error(`Invalid attribute type: "${attributeType}"`);
      }
    }
    i = skipWhitespace(xmlData, i);
    let defaultValue = "";
    if (xmlData.substring(i, i + 8).toUpperCase() === "#REQUIRED") {
      defaultValue = "#REQUIRED";
      i += 8;
    } else if (xmlData.substring(i, i + 7).toUpperCase() === "#IMPLIED") {
      defaultValue = "#IMPLIED";
      i += 7;
    } else {
      [i, defaultValue] = this.readIdentifierVal(xmlData, i, "ATTLIST");
    }
    return {
      elementName,
      attributeName,
      attributeType,
      defaultValue,
      index: i
    };
  }
};
var skipWhitespace = (data, index) => {
  while (index < data.length && /\s/.test(data[index])) {
    index++;
  }
  return index;
};
function hasSeq(data, seq, i) {
  for (let j = 0; j < seq.length; j++) {
    if (seq[j] !== data[i + j + 1]) return false;
  }
  return true;
}
function validateEntityName2(name, xmlVersion) {
  if (qName(name, { xmlVersion }))
    return name;
  else
    throw new Error(`Invalid entity name ${name}`);
}

// ../node_modules/anynum/digitTable.js
var SCRIPT_ZEROS = [
  // Basic Latin (ASCII) — included for completeness / pass-through
  48,
  // 0-9
  // Arabic scripts
  1632,
  // Arabic-Indic ٠١٢٣٤٥٦٧٨٩
  1776,
  // Extended Arabic-Indic (Urdu/Persian/Sindhi) ۰۱۲۳
  // Indic scripts
  2406,
  // Devanagari ०१२३४५६७८९
  2534,
  // Bengali ০১২৩৪৫৬৭৮৯
  2662,
  // Gurmukhi ੦੧੨੩੪੫੬੭੮੯
  2790,
  // Gujarati ૦૧૨૩૪૫૬૭૮૯
  2918,
  // Odia ୦୧୨୩୪୫୬୭୮୯
  3046,
  // Tamil ௦௧௨௩௪௫௬௭௮௯
  3174,
  // Telugu ౦౧౨౩౪౫౬౭౮౯
  3302,
  // Kannada ೦೧೨೩೪೫೬೭೮೯
  3430,
  // Malayalam ൦൧൨൩൪൫൬൭൮൯
  3558,
  // Sinhala Archaic ෦෧෨෩෪෫෬෭෮෯
  // Southeast Asian scripts
  3664,
  // Thai ๐๑๒๓๔๕๖๗๘๙
  3792,
  // Lao ໐໑໒໓໔໕໖໗໘໙
  3872,
  // Tibetan ༠༡༢༣༤༥༦༧༨༩
  4160,
  // Myanmar ၀၁၂၃၄၅၆၇၈၉
  4240,
  // Myanmar Shan ႐႑႒႓႔႕႖႗႘႙
  6112,
  // Khmer ០១២៣៤៥៦៧៨៩
  6160,
  // Mongolian ᠐᠑᠒᠓᠔᠕᠖᠗᠘᠙
  6470,
  // Limbu ᥆᥇᥈᥉᥊᥋᥌᥍᥎᥏
  6608,
  // New Tai Lue ᧐᧑᧒᧓᧔᧕᧖᧗᧘᧙
  6784,
  // Tai Tham Hora ᪀᪁᪂᪃᪄᪅᪆᪇᪈᪉
  6800,
  // Tai Tham Tham ᪐᪑᪒᪓᪔᪕᪖᪗᪘᪙
  6992,
  // Balinese ᭐᭑᭒᭓᭔᭕᭖᭗᭘᭙
  7088,
  // Sundanese ᮰᮱᮲᮳᮴᮵᮶᮷᮸᮹
  7232,
  // Lepcha ᱀᱁᱂᱃᱄᱅᱆᱇᱈᱉
  7248,
  // Ol Chiki ᱐᱑᱒᱓᱔᱕᱖᱗᱘᱙
  // Fullwidth (CJK context)
  65296,
  // Fullwidth ０１２３４５６７８９
  // Mathematical digit variants (Unicode math block)
  120782,
  // Mathematical Bold
  120792,
  // Mathematical Double-Struck
  120802,
  // Mathematical Sans-Serif
  120812,
  // Mathematical Sans-Serif Bold
  120822,
  // Mathematical Monospace
  // Other scripts
  66720,
  // Osmanya 𐒠𐒡𐒢𐒣𐒤𐒥𐒦𐒧𐒨𐒩
  68912,
  // Hanifi Rohingya 𐴰𐴱𐴲𐴳𐴴𐴵𐴶𐴷𐴸𐴹
  69734,
  // Brahmi 𑁦𑁧𑁨𑁩𑁪𑁫𑁬𑁭𑁮𑁯
  69872,
  // Sora Sompeng 𑃰𑃱𑃲𑃳𑃴𑃵𑃶𑃷𑃸𑃹
  69942,
  // Chakma 𑄶𑄷𑄸𑄹𑄺𑄻𑄼𑄽𑄾𑄿
  70096,
  // Sharada 𑇐𑇑𑇒𑇓𑇔𑇕𑇖𑇗𑇘𑇙
  70384,
  // Khudawadi 𑋰𑋱𑋲𑋳𑋴𑋵𑋶𑋷𑋸𑋹
  70736,
  // Newa 𑑐𑑑𑑒𑑓𑑔𑑕𑑖𑑗𑑘𑑙
  70864,
  // Tirhuta 𑓐𑓑𑓒𑓓𑓔𑓕𑓖𑓗𑓘𑓙
  71248,
  // Modi 𑙐𑙑𑙒𑙓𑙔𑙕𑙖𑙗𑙘𑙙
  71360,
  // Takri 𑛀𑛁𑛂𑛃𑛄𑛅𑛆𑛇𑛈𑛉
  71472,
  // Ahom 𑜰𑜱𑜲𑜳𑜴𑜵𑜶𑜷𑜸𑜹
  71904,
  // Warang Citi 𑣠𑣡𑣢𑣣𑣤𑣥𑣦𑣧𑣨𑣩
  72016,
  // Dives Akuru 𑥐𑥑𑥒𑥓𑥔𑥕𑥖𑥗𑥘𑥙
  72688,
  // Khitan Small Script 𑯰𑯱𑯲𑯳𑯴𑯵𑯶𑯷𑯸𑯹
  72784,
  // Bhaiksuki 𑱐𑱑𑱒𑱓𑱔𑱕𑱖𑱗𑱘𑱙
  73040,
  // Masaram Gondi 𑵐𑵑𑵒𑵓𑵔𑵕𑵖𑵗𑵘𑵙
  73120,
  // Gunjala Gondi 𑶠𑶡𑶢𑶣𑶤𑶥𑶦𑶧𑶨𑶩
  73552,
  // Kawi 𑽐𑽑𑽒𑽓𑽔𑽕𑽖𑽗𑽘𑽙
  92768,
  // Mro 𖩠𖩡𖩢𖩣𖩤𖩥𖩦𖩧𖩨𖩩
  92864,
  // Tangsa 𖫀𖫁𖫂𖫃𖫄𖫅𖫆𖫇𖫈𖫉
  93008,
  // Pahawh Hmong 𖭐𖭑𖭒𖭓𖭔𖭕𖭖𖭗𖭘𖭙
  123200,
  // Nyiakeng Puachue Hmong 𞅀𞅁𞅂𞅃𞅄𞅅𞅆𞅇𞅈𞅉
  123632,
  // Wancho 𞋰𞋱𞋲𞋳𞋴𞋵𞋶𞋷𞋸𞋹
  124144,
  // Nag Mundari 𞓰𞓱𞓲𞓳𞓴𞓵𞓶𞓷𞓸𞓹
  125264,
  // Adlam 𞥐𞥑𞥒𞥓𞥔𞥕𞥖𞥗𞥘𞥙
  130032
  // Segmented digit symbols 🯰🯱🯲🯳🯴🯵🯶🯷🯸🯹
];
var NOT_DIGIT = 255;
var HIGH_MAP = /* @__PURE__ */ new Map();
var LOW_MAX = 65535;
var LOW_MIN = 1632;
var TABLE_OFFSET = LOW_MIN;
var TABLE_SIZE = LOW_MAX - LOW_MIN + 1;
var TABLE = new Uint8Array(TABLE_SIZE).fill(NOT_DIGIT);
for (const zero of SCRIPT_ZEROS) {
  for (let d = 0; d < 10; d++) {
    const cp = zero + d;
    if (cp <= LOW_MAX) {
      TABLE[cp - TABLE_OFFSET] = d;
    } else {
      HIGH_MAP.set(cp, d);
    }
  }
}

// ../node_modules/anynum/anynum.js
var CHAR_0 = 48;
var CHAR_9 = 57;
var CHAR_MINUS = 45;
var MINUS_SET = /* @__PURE__ */ new Set([8722, 65293, 65123]);
function anynum(str) {
  if (typeof str !== "string") return str;
  const len = str.length;
  if (len === 0) return str;
  let firstHit = -1;
  for (let i = 0; i < len; i++) {
    const cc = str.charCodeAt(i);
    if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) continue;
    if (cc < TABLE_OFFSET) {
      if (MINUS_SET.has(cc)) {
        firstHit = i;
        break;
      }
      continue;
    }
    if (cc >= 55296 && cc <= 56319) {
      if (i + 1 < len) {
        const low = str.charCodeAt(i + 1);
        if (low >= 56320 && low <= 57343) {
          const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
          if (HIGH_MAP.has(cp)) {
            firstHit = i;
            break;
          }
        }
      }
      continue;
    }
    if (TABLE[cc - TABLE_OFFSET] !== NOT_DIGIT || MINUS_SET.has(cc)) {
      firstHit = i;
      break;
    }
  }
  if (firstHit === -1) return str;
  const chars = [];
  if (firstHit > 0) chars.push(str.slice(0, firstHit));
  for (let i = firstHit; i < len; i++) {
    const cc = str.charCodeAt(i);
    if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) {
      chars.push(str[i]);
      continue;
    }
    if (cc < TABLE_OFFSET) {
      chars.push(MINUS_SET.has(cc) ? "-" : str[i]);
      continue;
    }
    if (cc >= 55296 && cc <= 56319) {
      if (i + 1 < len) {
        const low = str.charCodeAt(i + 1);
        if (low >= 56320 && low <= 57343) {
          const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
          const d2 = HIGH_MAP.get(cp);
          if (d2 !== void 0) {
            chars.push(String.fromCharCode(d2 + 48));
            i++;
            continue;
          }
        }
      }
      chars.push(str[i]);
      continue;
    }
    if (MINUS_SET.has(cc)) {
      chars.push("-");
      continue;
    }
    const d = TABLE[cc - TABLE_OFFSET];
    chars.push(d !== NOT_DIGIT ? String.fromCharCode(d + 48) : str[i]);
  }
  return chars.join("");
}
var anynum_default = anynum;

// ../node_modules/strnum/strnum.js
var hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
var binRegex = /^0b[01]+$/;
var octRegex = /^0o[0-7]+$/;
var numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
var consider = {
  hex: true,
  binary: false,
  octal: false,
  leadingZeros: true,
  decimalPoint: ".",
  eNotation: true,
  //skipLike: /regex/,
  infinity: "original",
  // "null", "infinity" (Infinity type), "string" ("Infinity" (the string literal))
  unicode: false
};
function toNumber(str, options = {}) {
  options = Object.assign({}, consider, options);
  if (!str || typeof str !== "string") return str;
  let trimmedStr = str.trim();
  if (trimmedStr.length === 0) return str;
  else if (options.skipLike !== void 0 && options.skipLike.test(trimmedStr)) return str;
  else if (trimmedStr === "0") return 0;
  if (options.unicode) {
    trimmedStr = anynum_default(trimmedStr);
    if (trimmedStr === "0") return 0;
  }
  if (options.hex && hexRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 16);
  } else if (options.binary && binRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 2);
  } else if (options.octal && octRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 8);
  } else if (!isFinite(trimmedStr)) {
    return handleInfinity(str, Number(trimmedStr), options);
  } else if (trimmedStr.includes("e") || trimmedStr.includes("E")) {
    return resolveEnotation(str, trimmedStr, options);
  } else {
    const match = numRegex.exec(trimmedStr);
    if (match) {
      const sign = match[1] || "";
      const leadingZeros = match[2];
      let numTrimmedByZeros = trimZeros(match[3]);
      const decimalAdjacentToLeadingZeros = sign ? (
        // 0., -00., 000.
        str[leadingZeros.length + 1] === "."
      ) : str[leadingZeros.length] === ".";
      if (!options.leadingZeros && (leadingZeros.length > 1 || leadingZeros.length === 1 && !decimalAdjacentToLeadingZeros)) {
        return str;
      } else {
        const num = Number(trimmedStr);
        const parsedStr = String(num);
        if (num === 0) return num;
        if (parsedStr.search(/[eE]/) !== -1) {
          if (options.eNotation) return num;
          else return str;
        } else if (trimmedStr.indexOf(".") !== -1) {
          if (parsedStr === "0") return num;
          else if (parsedStr === numTrimmedByZeros) return num;
          else if (parsedStr === `${sign}${numTrimmedByZeros}`) return num;
          else return str;
        }
        let n = leadingZeros ? numTrimmedByZeros : trimmedStr;
        if (leadingZeros) {
          return n === parsedStr || sign + n === parsedStr ? num : str;
        } else {
          return n === parsedStr || n === sign + parsedStr ? num : str;
        }
      }
    } else {
      return str;
    }
  }
}
var eNotationRegx = /^([-+])?(0*)(\d*(\.\d*)?[eE][-\+]?\d+)$/;
function resolveEnotation(str, trimmedStr, options) {
  if (!options.eNotation) return str;
  const notation = trimmedStr.match(eNotationRegx);
  if (notation) {
    let sign = notation[1] || "";
    const eChar = notation[3].indexOf("e") === -1 ? "E" : "e";
    const leadingZeros = notation[2];
    const eAdjacentToLeadingZeros = sign ? (
      // 0E.
      str[leadingZeros.length + 1] === eChar
    ) : str[leadingZeros.length] === eChar;
    if (leadingZeros.length > 1 && eAdjacentToLeadingZeros) return str;
    else if (leadingZeros.length === 1 && (notation[3].startsWith(`.${eChar}`) || notation[3][0] === eChar)) {
      return Number(trimmedStr);
    } else if (leadingZeros.length > 0) {
      if (options.leadingZeros && !eAdjacentToLeadingZeros) {
        trimmedStr = (notation[1] || "") + notation[3];
        return Number(trimmedStr);
      } else return str;
    } else {
      return Number(trimmedStr);
    }
  } else {
    return str;
  }
}
function trimZeros(numStr) {
  if (numStr && numStr.indexOf(".") !== -1) {
    numStr = numStr.replace(/0+$/, "");
    if (numStr === ".") numStr = "0";
    else if (numStr[0] === ".") numStr = "0" + numStr;
    else if (numStr[numStr.length - 1] === ".") numStr = numStr.substring(0, numStr.length - 1);
    return numStr;
  }
  return numStr;
}
function parse_int(numStr, base) {
  const str = numStr.trim();
  if (base === 2 || base === 8) numStr = str.substring(2);
  if (parseInt) return parseInt(numStr, base);
  else if (Number.parseInt) return Number.parseInt(numStr, base);
  else if (window && window.parseInt) return window.parseInt(numStr, base);
  else throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
}
function handleInfinity(str, num, options) {
  const isPositive = num === Infinity;
  switch (options.infinity.toLowerCase()) {
    case "null":
      return null;
    case "infinity":
      return num;
    // Return Infinity or -Infinity
    case "string":
      return isPositive ? "Infinity" : "-Infinity";
    case "original":
    default:
      return str;
  }
}

// ../node_modules/fast-xml-parser/src/ignoreAttributes.js
function getIgnoreAttributesFn(ignoreAttributes) {
  if (typeof ignoreAttributes === "function") {
    return ignoreAttributes;
  }
  if (Array.isArray(ignoreAttributes)) {
    return (attrName) => {
      for (const pattern of ignoreAttributes) {
        if (typeof pattern === "string" && attrName === pattern) {
          return true;
        }
        if (pattern instanceof RegExp && pattern.test(attrName)) {
          return true;
        }
      }
    };
  }
  return () => false;
}

// ../node_modules/path-expression-matcher/src/Expression.js
var Expression = class {
  /**
   * Create a new Expression
   * @param {string} pattern - Pattern string (e.g., "root.users.user", "..user[id]")
   * @param {Object} options - Configuration options
   * @param {string} options.separator - Path separator (default: '.')
   */
  constructor(pattern, options = {}, data) {
    this.pattern = pattern;
    this.separator = options.separator || ".";
    this.segments = this._parse(pattern);
    this.data = data;
    this._hasDeepWildcard = this.segments.some((seg) => seg.type === "deep-wildcard");
    this._hasAttributeCondition = this.segments.some((seg) => seg.attrName !== void 0);
    this._hasPositionSelector = this.segments.some((seg) => seg.position !== void 0);
  }
  /**
   * Parse pattern string into segments
   * @private
   * @param {string} pattern - Pattern to parse
   * @returns {Array} Array of segment objects
   */
  _parse(pattern) {
    const segments = [];
    let i = 0;
    let currentPart = "";
    while (i < pattern.length) {
      if (pattern[i] === this.separator) {
        if (i + 1 < pattern.length && pattern[i + 1] === this.separator) {
          if (currentPart.trim()) {
            segments.push(this._parseSegment(currentPart.trim()));
            currentPart = "";
          }
          segments.push({ type: "deep-wildcard" });
          i += 2;
        } else {
          if (currentPart.trim()) {
            segments.push(this._parseSegment(currentPart.trim()));
          }
          currentPart = "";
          i++;
        }
      } else {
        currentPart += pattern[i];
        i++;
      }
    }
    if (currentPart.trim()) {
      segments.push(this._parseSegment(currentPart.trim()));
    }
    return segments;
  }
  /**
   * Parse a single segment
   * @private
   * @param {string} part - Segment string (e.g., "user", "ns::user", "user[id]", "ns::user:first")
   * @returns {Object} Segment object
   */
  _parseSegment(part) {
    const segment = { type: "tag" };
    let bracketContent = null;
    let withoutBrackets = part;
    const bracketMatch = part.match(/^([^\[]+)(\[[^\]]*\])(.*)$/);
    if (bracketMatch) {
      withoutBrackets = bracketMatch[1] + bracketMatch[3];
      if (bracketMatch[2]) {
        const content = bracketMatch[2].slice(1, -1);
        if (content) {
          bracketContent = content;
        }
      }
    }
    let namespace = void 0;
    let tagAndPosition = withoutBrackets;
    if (withoutBrackets.includes("::")) {
      const nsIndex = withoutBrackets.indexOf("::");
      namespace = withoutBrackets.substring(0, nsIndex).trim();
      tagAndPosition = withoutBrackets.substring(nsIndex + 2).trim();
      if (!namespace) {
        throw new Error(`Invalid namespace in pattern: ${part}`);
      }
    }
    let tag2 = void 0;
    let positionMatch = null;
    if (tagAndPosition.includes(":")) {
      const colonIndex = tagAndPosition.lastIndexOf(":");
      const tagPart = tagAndPosition.substring(0, colonIndex).trim();
      const posPart = tagAndPosition.substring(colonIndex + 1).trim();
      const isPositionKeyword = ["first", "last", "odd", "even"].includes(posPart) || /^nth\(\d+\)$/.test(posPart);
      if (isPositionKeyword) {
        tag2 = tagPart;
        positionMatch = posPart;
      } else {
        tag2 = tagAndPosition;
      }
    } else {
      tag2 = tagAndPosition;
    }
    if (!tag2) {
      throw new Error(`Invalid segment pattern: ${part}`);
    }
    segment.tag = tag2;
    if (namespace) {
      segment.namespace = namespace;
    }
    if (bracketContent) {
      if (bracketContent.includes("=")) {
        const eqIndex = bracketContent.indexOf("=");
        segment.attrName = bracketContent.substring(0, eqIndex).trim();
        segment.attrValue = bracketContent.substring(eqIndex + 1).trim();
      } else {
        segment.attrName = bracketContent.trim();
      }
    }
    if (positionMatch) {
      const nthMatch = positionMatch.match(/^nth\((\d+)\)$/);
      if (nthMatch) {
        segment.position = "nth";
        segment.positionValue = parseInt(nthMatch[1], 10);
      } else {
        segment.position = positionMatch;
      }
    }
    return segment;
  }
  /**
   * Get the number of segments
   * @returns {number}
   */
  get length() {
    return this.segments.length;
  }
  /**
   * Check if expression contains deep wildcard
   * @returns {boolean}
   */
  hasDeepWildcard() {
    return this._hasDeepWildcard;
  }
  /**
   * Check if expression has attribute conditions
   * @returns {boolean}
   */
  hasAttributeCondition() {
    return this._hasAttributeCondition;
  }
  /**
   * Check if expression has position selectors
   * @returns {boolean}
   */
  hasPositionSelector() {
    return this._hasPositionSelector;
  }
  /**
   * Get string representation
   * @returns {string}
   */
  toString() {
    return this.pattern;
  }
};

// ../node_modules/path-expression-matcher/src/ExpressionSet.js
var ExpressionSet = class {
  constructor() {
    this._byDepthAndTag = /* @__PURE__ */ new Map();
    this._wildcardByDepth = /* @__PURE__ */ new Map();
    this._deepWildcards = [];
    this._deepByTerminalTag = /* @__PURE__ */ new Map();
    this._patterns = /* @__PURE__ */ new Set();
    this._sealed = false;
  }
  /**
   * Add an Expression to the set.
   * Duplicate patterns (same pattern string) are silently ignored.
   *
   * @param {import('./Expression.js').default} expression - A pre-constructed Expression instance
   * @returns {this} for chaining
   * @throws {TypeError} if called after seal()
   *
   * @example
   * set.add(new Expression('root.users.user'));
   * set.add(new Expression('..script'));
   */
  add(expression) {
    if (this._sealed) {
      throw new TypeError(
        "ExpressionSet is sealed. Create a new ExpressionSet to add more expressions."
      );
    }
    if (this._patterns.has(expression.pattern)) return this;
    this._patterns.add(expression.pattern);
    if (expression.hasDeepWildcard()) {
      const lastSeg2 = expression.segments[expression.segments.length - 1];
      if (lastSeg2 && lastSeg2.type !== "deep-wildcard" && lastSeg2.tag !== "*") {
        const tag3 = lastSeg2.tag;
        if (!this._deepByTerminalTag.has(tag3)) this._deepByTerminalTag.set(tag3, []);
        this._deepByTerminalTag.get(tag3).push(expression);
      } else {
        this._deepWildcards.push(expression);
      }
      return this;
    }
    const depth = expression.length;
    const lastSeg = expression.segments[expression.segments.length - 1];
    const tag2 = lastSeg?.tag;
    if (!tag2 || tag2 === "*") {
      if (!this._wildcardByDepth.has(depth)) this._wildcardByDepth.set(depth, []);
      this._wildcardByDepth.get(depth).push(expression);
    } else {
      const key2 = `${depth}:${tag2}`;
      if (!this._byDepthAndTag.has(key2)) this._byDepthAndTag.set(key2, []);
      this._byDepthAndTag.get(key2).push(expression);
    }
    return this;
  }
  /**
   * Add multiple expressions at once.
   *
   * @param {import('./Expression.js').default[]} expressions - Array of Expression instances
   * @returns {this} for chaining
   *
   * @example
   * set.addAll([
   *   new Expression('root.users.user'),
   *   new Expression('root.config.setting'),
   * ]);
   */
  addAll(expressions) {
    for (const expr of expressions) this.add(expr);
    return this;
  }
  /**
   * Check whether a pattern string is already present in the set.
   *
   * @param {import('./Expression.js').default} expression
   * @returns {boolean}
   */
  has(expression) {
    return this._patterns.has(expression.pattern);
  }
  /**
   * Number of expressions in the set.
   * @type {number}
   */
  get size() {
    return this._patterns.size;
  }
  /**
   * Seal the set against further modifications.
   * Useful to prevent accidental mutations after config is built.
   * Calling add() or addAll() on a sealed set throws a TypeError.
   *
   * @returns {this}
   */
  seal() {
    this._sealed = true;
    return this;
  }
  /**
   * Whether the set has been sealed.
   * @type {boolean}
   */
  get isSealed() {
    return this._sealed;
  }
  /**
   * Test whether the matcher's current path matches any expression in the set.
   *
   * Evaluation order (cheapest → most expensive):
   *  1. Exact depth + tag bucket  — O(1) lookup, typically 0–2 expressions
   *  2. Depth-only wildcard bucket — O(1) lookup, rare
   *  3. Deep-wildcard list         — always checked, but usually small
   *
   * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
   * @returns {boolean} true if any expression matches the current path
   *
   * @example
   * if (stopNodes.matchesAny(matcher)) {
   *   // handle stop node
   * }
   */
  matchesAny(matcher) {
    return this.findMatch(matcher) !== null;
  }
  /**
  * Find and return the first Expression that matches the matcher's current path.
  *
  * Uses the same evaluation order as matchesAny (cheapest → most expensive):
  *  1. Exact depth + tag bucket
  *  2. Depth-only wildcard bucket
  *  3. Deep-wildcard list
  *
  * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
  * @returns {import('./Expression.js').default | null} the first matching Expression, or null
  *
  * @example
  * const expr = stopNodes.findMatch(matcher);
  * if (expr) {
  *   // access expr.config, expr.pattern, etc.
  * }
  */
  findMatch(matcher) {
    const depth = matcher.getDepth();
    const tag2 = matcher.getCurrentTag();
    const exactKey = `${depth}:${tag2}`;
    const exactBucket = this._byDepthAndTag.get(exactKey);
    if (exactBucket) {
      for (let i = 0; i < exactBucket.length; i++) {
        if (matcher.matches(exactBucket[i])) return exactBucket[i];
      }
    }
    const wildcardBucket = this._wildcardByDepth.get(depth);
    if (wildcardBucket) {
      for (let i = 0; i < wildcardBucket.length; i++) {
        if (matcher.matches(wildcardBucket[i])) return wildcardBucket[i];
      }
    }
    const deepBucket = this._deepByTerminalTag.get(tag2);
    if (deepBucket) {
      for (let i = 0; i < deepBucket.length; i++) {
        if (matcher.matches(deepBucket[i])) return deepBucket[i];
      }
    }
    for (let i = 0; i < this._deepWildcards.length; i++) {
      if (matcher.matches(this._deepWildcards[i])) return this._deepWildcards[i];
    }
    return null;
  }
};

// ../node_modules/path-expression-matcher/src/Matcher.js
var MatcherView = class {
  /**
   * @param {Matcher} matcher - The parent Matcher instance to read from.
   */
  constructor(matcher) {
    this._matcher = matcher;
  }
  /**
   * Get the path separator used by the parent matcher.
   * @returns {string}
   */
  get separator() {
    return this._matcher.separator;
  }
  /**
   * Get current tag name.
   * @returns {string|undefined}
   */
  getCurrentTag() {
    const path = this._matcher.path;
    return path.length > 0 ? path[path.length - 1].tag : void 0;
  }
  /**
   * Get current namespace.
   * @returns {string|undefined}
   */
  getCurrentNamespace() {
    const path = this._matcher.path;
    return path.length > 0 ? path[path.length - 1].namespace : void 0;
  }
  /**
   * Get current node's attribute value.
   * @param {string} attrName
   * @returns {*}
   */
  getAttrValue(attrName) {
    const path = this._matcher.path;
    if (path.length === 0) return void 0;
    return path[path.length - 1].values?.[attrName];
  }
  /**
   * Check if current node has an attribute.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAttr(attrName) {
    const path = this._matcher.path;
    if (path.length === 0) return false;
    const current = path[path.length - 1];
    return current.values !== void 0 && attrName in current.values;
  }
  /**
   * Get the value of a "kept" attribute from the nearest ancestor (or
   * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {*}
   */
  getAnyParentAttr(attrName) {
    return this._matcher.getAnyParentAttr(attrName);
  }
  /**
   * Check whether any ancestor (or the current node) kept the given
   * attribute via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAnyParentAttr(attrName) {
    return this._matcher.hasAnyParentAttr(attrName);
  }
  /**
   * Get current node's sibling position (child index in parent).
   * @returns {number}
   */
  getPosition() {
    const path = this._matcher.path;
    if (path.length === 0) return -1;
    return path[path.length - 1].position ?? 0;
  }
  /**
   * Get current node's repeat counter (occurrence count of this tag name).
   * @returns {number}
   */
  getCounter() {
    const path = this._matcher.path;
    if (path.length === 0) return -1;
    return path[path.length - 1].counter ?? 0;
  }
  /**
   * Get current node's sibling index (alias for getPosition).
   * @returns {number}
   * @deprecated Use getPosition() or getCounter() instead
   */
  getIndex() {
    return this.getPosition();
  }
  /**
   * Get current path depth.
   * @returns {number}
   */
  getDepth() {
    return this._matcher.path.length;
  }
  /**
   * Get path as string.
   * @param {string} [separator] - Optional separator (uses default if not provided)
   * @param {boolean} [includeNamespace=true]
   * @returns {string}
   */
  toString(separator, includeNamespace = true) {
    return this._matcher.toString(separator, includeNamespace);
  }
  /**
   * Get path as array of tag names.
   * @returns {string[]}
   */
  toArray() {
    return this._matcher.path.map((n) => n.tag);
  }
  /**
   * Match current path against an Expression.
   * @param {Expression} expression
   * @returns {boolean}
   */
  matches(expression) {
    return this._matcher.matches(expression);
  }
  /**
   * Match any expression in the given set against the current path.
   * @param {ExpressionSet} exprSet
   * @returns {boolean}
   */
  matchesAny(exprSet) {
    return exprSet.matchesAny(this._matcher);
  }
};
var Matcher = class {
  /**
   * Create a new Matcher.
   * @param {Object} [options={}]
   * @param {string} [options.separator='.'] - Default path separator
   */
  constructor(options = {}) {
    this.separator = options.separator || ".";
    this.path = [];
    this.siblingStacks = [];
    this._pathStringCache = null;
    this._view = new MatcherView(this);
    this._keptAttrs = [];
  }
  /**
   * Push a new tag onto the path.
   * @param {string} tagName
   * @param {Object|null} [attrValues=null]
   * @param {string|null} [namespace=null]
   * @param {Object|null} [options=null]
   * @param {string[]} [options.keep] - Names of attributes (from attrValues)
   */
  push(tagName, attrValues = null, namespace = null, options = null) {
    this._pathStringCache = null;
    if (this.path.length > 0) {
      this.path[this.path.length - 1].values = void 0;
    }
    const currentLevel = this.path.length;
    let level = this.siblingStacks[currentLevel];
    if (!level) {
      level = { counts: /* @__PURE__ */ new Map(), total: 0 };
      this.siblingStacks[currentLevel] = level;
    }
    const siblingKey = namespace ? `${namespace}:${tagName}` : tagName;
    const counter = level.counts.get(siblingKey) || 0;
    const position = level.total;
    level.counts.set(siblingKey, counter + 1);
    level.total++;
    const node = {
      tag: tagName,
      position,
      counter
    };
    if (namespace !== null && namespace !== void 0) {
      node.namespace = namespace;
    }
    if (attrValues !== null && attrValues !== void 0) {
      node.values = attrValues;
    }
    this.path.push(node);
    const depth = this.path.length;
    const keep = options !== null ? options.keep : null;
    if (keep !== null && keep !== void 0 && keep.length > 0 && attrValues) {
      for (let i = 0; i < keep.length; i++) {
        const name = keep[i];
        if (attrValues[name] !== void 0) {
          this._keptAttrs.push({ depth, name, value: attrValues[name] });
        }
      }
    }
  }
  /**
   * Pop the last tag from the path.
   * @returns {Object|undefined} The popped node
   */
  pop() {
    if (this.path.length === 0) return void 0;
    this._pathStringCache = null;
    const node = this.path.pop();
    if (this.siblingStacks.length > this.path.length + 1) {
      this.siblingStacks.length = this.path.length + 1;
    }
    const poppedDepth = this.path.length + 1;
    while (this._keptAttrs.length > 0 && this._keptAttrs[this._keptAttrs.length - 1].depth >= poppedDepth) {
      this._keptAttrs.pop();
    }
    return node;
  }
  /**
   * Update current node's attribute values.
   * Useful when attributes are parsed after push.
   * @param {Object} attrValues
   */
  updateCurrent(attrValues) {
    if (this.path.length > 0) {
      const current = this.path[this.path.length - 1];
      if (attrValues !== null && attrValues !== void 0) {
        current.values = attrValues;
      }
    }
  }
  /**
   * Get current tag name.
   * @returns {string|undefined}
   */
  getCurrentTag() {
    return this.path.length > 0 ? this.path[this.path.length - 1].tag : void 0;
  }
  /**
   * Get current namespace.
   * @returns {string|undefined}
   */
  getCurrentNamespace() {
    return this.path.length > 0 ? this.path[this.path.length - 1].namespace : void 0;
  }
  /**
   * Get current node's attribute value.
   * @param {string} attrName
   * @returns {*}
   */
  getAttrValue(attrName) {
    if (this.path.length === 0) return void 0;
    return this.path[this.path.length - 1].values?.[attrName];
  }
  /**
   * Check if current node has an attribute.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAttr(attrName) {
    if (this.path.length === 0) return false;
    const current = this.path[this.path.length - 1];
    return current.values !== void 0 && attrName in current.values;
  }
  /**
   * Get the value of a "kept" attribute from the nearest ancestor (or
   * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
   * Unlike getAttrValue(), this works regardless of how deep the path has
   * gone since the attribute was pushed — but only for attribute names that
   * were explicitly marked with `keep` at push time. Cost is proportional to
   * the number of currently-kept attributes (typically 0-3), not path depth.
   * @param {string} attrName
   * @returns {*} the value, or undefined if no ancestor kept this attribute
   */
  getAnyParentAttr(attrName) {
    const kept = this._keptAttrs;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i].name === attrName) return kept[i].value;
    }
    return void 0;
  }
  /**
   * Check whether any ancestor (or the current node) kept the given
   * attribute via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAnyParentAttr(attrName) {
    const kept = this._keptAttrs;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i].name === attrName) return true;
    }
    return false;
  }
  /**
   * Get current node's sibling position (child index in parent).
   * @returns {number}
   */
  getPosition() {
    if (this.path.length === 0) return -1;
    return this.path[this.path.length - 1].position ?? 0;
  }
  /**
   * Get current node's repeat counter (occurrence count of this tag name).
   * @returns {number}
   */
  getCounter() {
    if (this.path.length === 0) return -1;
    return this.path[this.path.length - 1].counter ?? 0;
  }
  /**
   * Get current node's sibling index (alias for getPosition).
   * @returns {number}
   * @deprecated Use getPosition() or getCounter() instead
   */
  getIndex() {
    return this.getPosition();
  }
  /**
   * Get current path depth.
   * @returns {number}
   */
  getDepth() {
    return this.path.length;
  }
  /**
   * Get path as string.
   * @param {string} [separator] - Optional separator (uses default if not provided)
   * @param {boolean} [includeNamespace=true]
   * @returns {string}
   */
  toString(separator, includeNamespace = true) {
    const sep2 = separator || this.separator;
    const isDefault = sep2 === this.separator && includeNamespace === true;
    if (isDefault) {
      if (this._pathStringCache !== null) {
        return this._pathStringCache;
      }
      const result2 = this.path.map(
        (n) => n.namespace ? `${n.namespace}:${n.tag}` : n.tag
      ).join(sep2);
      this._pathStringCache = result2;
      return result2;
    }
    return this.path.map(
      (n) => includeNamespace && n.namespace ? `${n.namespace}:${n.tag}` : n.tag
    ).join(sep2);
  }
  /**
   * Get path as array of tag names.
   * @returns {string[]}
   */
  toArray() {
    return this.path.map((n) => n.tag);
  }
  /**
   * Reset the path to empty.
   */
  reset() {
    this._pathStringCache = null;
    this.path = [];
    this.siblingStacks = [];
    this._keptAttrs = [];
  }
  /**
   * Match current path against an Expression.
   * @param {Expression} expression
   * @returns {boolean}
   */
  matches(expression) {
    const segments = expression.segments;
    if (segments.length === 0) {
      return false;
    }
    if (expression.hasDeepWildcard()) {
      return this._matchWithDeepWildcard(segments);
    }
    return this._matchSimple(segments);
  }
  /**
   * @private
   */
  _matchSimple(segments) {
    if (this.path.length !== segments.length) {
      return false;
    }
    for (let i = 0; i < segments.length; i++) {
      if (!this._matchSegment(segments[i], this.path[i], i === this.path.length - 1)) {
        return false;
      }
    }
    return true;
  }
  /**
   * @private
   */
  _matchWithDeepWildcard(segments) {
    let pathIdx = this.path.length - 1;
    let segIdx = segments.length - 1;
    while (segIdx >= 0 && pathIdx >= 0) {
      const segment = segments[segIdx];
      if (segment.type === "deep-wildcard") {
        segIdx--;
        if (segIdx < 0) {
          return true;
        }
        const nextSeg = segments[segIdx];
        let found = false;
        for (let i = pathIdx; i >= 0; i--) {
          if (this._matchSegment(nextSeg, this.path[i], i === this.path.length - 1)) {
            pathIdx = i - 1;
            segIdx--;
            found = true;
            break;
          }
        }
        if (!found) {
          return false;
        }
      } else {
        if (!this._matchSegment(segment, this.path[pathIdx], pathIdx === this.path.length - 1)) {
          return false;
        }
        pathIdx--;
        segIdx--;
      }
    }
    return segIdx < 0;
  }
  /**
   * @private
   */
  _matchSegment(segment, node, isCurrentNode) {
    if (segment.tag !== "*" && segment.tag !== node.tag) {
      return false;
    }
    if (segment.namespace !== void 0) {
      if (segment.namespace !== "*" && segment.namespace !== node.namespace) {
        return false;
      }
    }
    if (segment.attrName !== void 0) {
      if (!isCurrentNode) {
        return false;
      }
      if (!node.values || !(segment.attrName in node.values)) {
        return false;
      }
      if (segment.attrValue !== void 0) {
        if (String(node.values[segment.attrName]) !== String(segment.attrValue)) {
          return false;
        }
      }
    }
    if (segment.position !== void 0) {
      if (!isCurrentNode) {
        return false;
      }
      const counter = node.counter ?? 0;
      if (segment.position === "first" && counter !== 0) {
        return false;
      } else if (segment.position === "odd" && counter % 2 !== 1) {
        return false;
      } else if (segment.position === "even" && counter % 2 !== 0) {
        return false;
      } else if (segment.position === "nth" && counter !== segment.positionValue) {
        return false;
      }
    }
    return true;
  }
  /**
   * Match any expression in the given set against the current path.
   * @param {ExpressionSet} exprSet
   * @returns {boolean}
   */
  matchesAny(exprSet) {
    return exprSet.matchesAny(this);
  }
  /**
   * Create a snapshot of current state.
   * @returns {Object}
   */
  snapshot() {
    return {
      path: this.path.map((node) => ({ ...node })),
      siblingStacks: this.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level),
      keptAttrs: this._keptAttrs.map((entry) => ({ ...entry }))
    };
  }
  /**
   * Restore state from snapshot.
   * @param {Object} snapshot
   */
  restore(snapshot) {
    this._pathStringCache = null;
    this.path = snapshot.path.map((node) => ({ ...node }));
    this.siblingStacks = snapshot.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level);
    this._keptAttrs = (snapshot.keptAttrs || []).map((entry) => ({ ...entry }));
  }
  /**
   * Return the read-only {@link MatcherView} for this matcher.
   *
   * The same instance is returned on every call — no allocation occurs.
   * It always reflects the current parser state and is safe to pass to
   * user callbacks without risk of accidental mutation.
   *
   * @returns {MatcherView}
   *
   * @example
   * const view = matcher.readOnly();
   * // pass view to callbacks — it stays in sync automatically
   * view.matches(expr);       // ✓
   * view.getCurrentTag();     // ✓
   * // view.push(...)         // ✗ method does not exist — caught by TypeScript
   */
  readOnly() {
    return this._view;
  }
};

// ../node_modules/is-unsafe/src/contexts/html.js
var HTML_PATTERNS = [
  {
    id: "html-script-open",
    description: "<script opening tag",
    pattern: /<script[\s>/]/i
  },
  {
    id: "html-script-close",
    description: "</script closing tag",
    pattern: /<\/script[\s>]/i
  },
  {
    id: "html-javascript-protocol",
    description: "javascript: URI scheme (with optional whitespace/encoding)",
    // Handles j&#x61;vascript:, j\u0061vascript:, and whitespace variants
    pattern: /j[\t\n\r ]*a[\t\n\r ]*v[\t\n\r ]*a[\t\n\r ]*s[\t\n\r ]*c[\t\n\r ]*r[\t\n\r ]*i[\t\n\r ]*p[\t\n\r ]*t[\t\n\r ]*:/i
  },
  {
    id: "html-vbscript-protocol",
    description: "vbscript: URI scheme",
    pattern: /vbscript[\t\n\r ]*:/i
  },
  {
    id: "html-data-html",
    description: "data:text/html URI \u2014 can execute scripts in browsers",
    pattern: /data[\t\n\r ]*:[\t\n\r ]*text\/html/i
  },
  {
    id: "html-data-xhtml",
    description: "data:application/xhtml+xml URI",
    pattern: /data[\t\n\r ]*:[\t\n\r ]*application\/xhtml/i
  },
  {
    id: "html-data-svg",
    description: "data:image/svg+xml URI \u2014 can execute scripts",
    pattern: /data[\t\n\r ]*:[\t\n\r ]*image\/svg\+xml/i
  },
  {
    id: "html-inline-event-handler",
    description: "Inline event handler attributes: onclick=, onerror=, onload=, etc.",
    // \bon ensures we match a word boundary so "phonetic=" is not caught
    pattern: /\bon\w{1,30}\s*=/i
  },
  {
    id: "html-entity-obfuscated-script",
    description: "HTML-entity-encoded <script (e.g. &#x3C;script or &lt;script)",
    // Entities include optional trailing semicolon: &#x3C; or &#x3C (both valid in HTML5)
    pattern: /(?:&#x0*3[Cc];?|&#0*60;?|&lt;)\s*script/i
  },
  {
    id: "html-entity-obfuscated-javascript",
    description: 'HTML-entity-encoded javascript: (partial \u2014 catches common &#106; or &#x6a; for "j")',
    pattern: /(?:&#x0*6[Aa];?|&#0*106;?)\s*(?:&#x0*61;?|a)[\s\S]{0,80}script\s*:/i
  },
  {
    id: "html-style-expression",
    description: "CSS expression() \u2014 IE-era code execution in style attributes",
    pattern: /style[\s\S]{0,20}expression\s*\(/i
  },
  {
    id: "html-object-embed",
    description: "<object or <embed tags that can load active content",
    pattern: /<(?:object|embed)[\s>/]/i
  },
  {
    id: "html-base-tag",
    description: "<base href= \u2014 can hijack all relative URLs on a page",
    pattern: /<base[\s>]/i
  },
  {
    id: "html-meta-refresh",
    description: '<meta http-equiv="refresh" \u2014 can redirect users',
    pattern: /<meta[\s\S]{0,40}http-equiv[\s\S]{0,20}refresh/i
  },
  {
    id: "html-srcdoc",
    description: "srcdoc= attribute on iframes \u2014 embeds HTML that can run scripts",
    pattern: /srcdoc\s*=/i
  },
  {
    id: "html-iframe",
    description: "<iframe tag",
    pattern: /<iframe[\s>/]/i
  },
  {
    id: "html-form",
    description: "<form tag \u2014 can be used for phishing / credential harvesting injection",
    pattern: /<form[\s>/]/i
  }
];
var html_default = HTML_PATTERNS;

// ../node_modules/is-unsafe/src/contexts/xml.js
var XML_PATTERNS = [
  {
    id: "xml-cdata-injection",
    description: "CDATA section injection: <![CDATA[ breaks out of text node context",
    pattern: /<!\[CDATA\[/i
  },
  {
    id: "xml-cdata-close",
    description: "CDATA close sequence: ]]> can terminate an enclosing CDATA section",
    pattern: /\]\]>/
  },
  {
    id: "xml-processing-instruction",
    description: "XML processing instruction: <?xml-stylesheet or <?php etc.",
    pattern: /<\?(?:xml[\- ]|php|asp)/i
  },
  {
    id: "xml-doctype-injection",
    description: "DOCTYPE declaration embedded in content \u2014 can define entities",
    // Match <!DOCTYPE followed by end-of-string, whitespace, or [ (internal subset)
    pattern: /<!DOCTYPE(?:[\s[]|$)/i
  },
  {
    id: "xml-entity-system",
    description: "SYSTEM keyword \u2014 used in external entity declarations (XXE)",
    pattern: /\bSYSTEM\s+["']/i
  },
  {
    id: "xml-entity-public",
    description: "PUBLIC keyword \u2014 used in external entity declarations (XXE)",
    pattern: /\bPUBLIC\s+["']/i
  },
  {
    id: "xml-entity-declaration",
    description: "<!ENTITY declaration \u2014 defines entities, potential XXE or entity expansion",
    pattern: /<!ENTITY[\s%]/i
  },
  {
    id: "xml-billion-laughs",
    description: "Entity reference chaining / billion laughs: repeated &eX; style references",
    // Heuristic: 3+ consecutive entity refs suggests expansion attack
    pattern: /(?:&\w{1,20};){3,}/
  },
  {
    id: "xml-namespace-confusion",
    description: "xmlns: attribute injection \u2014 can redefine namespaces to confuse parsers",
    pattern: /\bxmlns\s*(?::\w{1,40})?\s*=/i
  },
  {
    id: "xml-comment-injection",
    description: "<!-- comment injection \u2014 can hide content from some parsers",
    pattern: /<!--/
  },
  {
    id: "xml-comment-close",
    description: "--> closes an enclosing XML comment",
    pattern: /-->/
  },
  {
    id: "xml-pi-close",
    description: "?> closes an enclosing processing instruction",
    pattern: /\?>/
  }
];
var xml_default = XML_PATTERNS;

// ../node_modules/is-unsafe/src/contexts/svg.js
var SVG_PATTERNS = [
  {
    id: "svg-script-element",
    description: "<script element inside SVG executes JavaScript",
    pattern: /<script[\s>/]/i
  },
  {
    id: "svg-xlink-href-javascript",
    description: "xlink:href with javascript: \u2014 classic SVG XSS via <a> or <use>",
    pattern: /xlink\s*:\s*href\s*=\s*["']?\s*javascript\s*:/i
  },
  {
    id: "svg-href-javascript",
    description: "href= with javascript: in SVG context (<a>, <animate>, etc.)",
    pattern: /href\s*=\s*["']?\s*javascript\s*:/i
  },
  {
    id: "svg-foreignobject",
    description: "<foreignObject embeds HTML inside SVG \u2014 can execute scripts",
    pattern: /<foreignObject[\s>/]/i
  },
  {
    id: "svg-use-external",
    description: "<use xlink:href or href pointing to external resource (non-fragment URL)",
    // Match <use with href= where the value starts with a non-# character (external URL)
    // [\"'][^#] catches quoted values not starting with #; [^\"'#\s>] catches unquoted
    pattern: /<use[\s\S]{0,60}(?:xlink\s*:\s*)?href\s*=\s*(?:["'][^#]|[^"'#\s>])/i
  },
  {
    id: "svg-animate-href",
    description: '<animate attributeName="href" \u2014 can dynamically change href to javascript:',
    pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*href["']/i
  },
  {
    id: "svg-animate-xlinkhref",
    description: '<animate attributeName="xlink:href"',
    pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*xlink\s*:\s*href["']/i
  },
  {
    id: "svg-set-javascript",
    description: '<set to="javascript:..." \u2014 sets an attribute to a javascript: URI',
    pattern: /<set[\s\S]{0,80}to\s*=\s*["']?\s*javascript\s*:/i
  },
  {
    id: "svg-event-handler",
    description: "SVG-specific event handler attributes: onload=, onerror=, onactivate=, etc.",
    pattern: /\bon(?:load|error|activate|begin|end|repeat|focus|blur|click|mouse\w{1,20}|key\w{1,20})\s*=/i
  },
  {
    id: "svg-handler-generic",
    description: "Generic on* handler catch-all for SVG attributes",
    pattern: /\bon\w{1,30}\s*=/i
  },
  {
    id: "svg-filter-feimage",
    description: "<feImage href= \u2014 filter primitive that can load external resources",
    pattern: /<feImage[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=/i
  },
  {
    id: "svg-image-external",
    description: "<image xlink:href with http/https or javascript protocol",
    pattern: /<image[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=\s*["']?\s*(?:https?|javascript)\s*:/i
  },
  {
    id: "svg-style-javascript",
    description: "style= attribute containing javascript: (e.g. background:url(javascript:...))",
    pattern: /style\s*=[\s\S]{0,60}javascript\s*:/i
  }
];
var svg_default = SVG_PATTERNS;

// ../node_modules/is-unsafe/src/contexts/sql.js
var SQL_PATTERNS = [
  {
    id: "sql-block-comment-open",
    description: "SQL block comment open: /* ... */ \u2014 unusual in legitimate user text",
    pattern: /\/\*/
  },
  {
    id: "sql-union-select",
    description: "UNION SELECT \u2014 most common SQL injection aggregation attack",
    pattern: /\bUNION\s{1,20}(?:ALL\s{1,20})?SELECT\b/i
  },
  {
    id: "sql-drop-table",
    description: "DROP TABLE \u2014 destructive DDL injection",
    pattern: /\bDROP\s{1,20}TABLE\b/i
  },
  {
    id: "sql-drop-database",
    description: "DROP DATABASE \u2014 destructive DDL injection",
    pattern: /\bDROP\s{1,20}DATABASE\b/i
  },
  {
    id: "sql-insert-into",
    description: "INSERT INTO \u2014 data injection",
    pattern: /\bINSERT\s{1,20}INTO\b/i
  },
  {
    id: "sql-delete-from",
    description: "DELETE FROM \u2014 data deletion injection",
    pattern: /\bDELETE\s{1,20}FROM\b/i
  },
  {
    id: "sql-update-set",
    description: "UPDATE ... SET \u2014 data modification injection",
    // Allows arbitrary content between UPDATE and SET (table name, alias, etc.)
    pattern: /\bUPDATE\b[\s\S]{1,60}\bSET\b/i
  },
  {
    id: "sql-exec-xp",
    description: "EXEC xp_ \u2014 MSSQL extended stored procedure execution",
    pattern: /\bEXEC(?:UTE)?\s{1,20}xp_/i
  },
  {
    id: "sql-tautology-string",
    description: `Classic string tautology: ' OR '1'='1 or " OR "1"="1"`,
    // Last quote is optional — injection may truncate it: ' OR '1'='1--
    pattern: /'\s{0,10}OR\s{0,10}'[^']{0,20}'\s*=\s*'[^']{0,20}/i
  },
  {
    id: "sql-tautology-numeric",
    description: "Numeric tautology: OR 1=1",
    pattern: /\bOR\s{1,10}1\s*=\s*1\b/i
  },
  {
    id: "sql-always-true-zero",
    description: "Numeric tautology: OR 0=0",
    pattern: /\bOR\s{1,10}0\s*=\s*0\b/i
  },
  {
    id: "sql-sleep-benchmark",
    description: "Time-based blind injection: SLEEP() or BENCHMARK()",
    pattern: /\b(?:SLEEP|BENCHMARK)\s*\(/i
  },
  {
    id: "sql-waitfor-delay",
    description: "MSSQL time-based blind injection: WAITFOR DELAY",
    pattern: /\bWAITFOR\s{1,20}DELAY\b/i
  },
  {
    id: "sql-char-function",
    description: "CHAR() function \u2014 used to obfuscate injected strings",
    pattern: /\bCHAR\s*\(\s*\d{1,3}/i
  },
  {
    id: "sql-information-schema",
    description: "INFORMATION_SCHEMA \u2014 reconnaissance query for table/column enumeration",
    pattern: /\bINFORMATION_SCHEMA\b/i
  }
];
var sql_default = SQL_PATTERNS;

// ../node_modules/is-unsafe/src/contexts/shell.js
var SHELL_PATTERNS = [
  {
    id: "shell-path-traversal-unix",
    description: "Unix path traversal: ../  \u2014 climbing the directory tree",
    pattern: /\.\.\//
  },
  {
    id: "shell-path-traversal-windows",
    description: "Windows path traversal: ..\\ \u2014 climbing the directory tree",
    pattern: /\.\.\\/
  },
  {
    id: "shell-path-traversal-encoded",
    description: "URL-encoded path traversal: %2e%2e or %2f variants",
    pattern: /%2e%2e|%2f\.\.|\.\.%2f/i
  },
  {
    id: "shell-null-byte",
    description: "Null byte injection: \\x00 or %00 \u2014 truncates strings in C-backed functions",
    pattern: /\x00|%00/
  },
  {
    id: "shell-semicolon",
    description: "Semicolon command separator: cmd1; cmd2",
    pattern: /;/
  },
  {
    id: "shell-pipe",
    description: "Pipe operator: cmd1 | cmd2",
    pattern: /\|/
  },
  {
    id: "shell-and-operator",
    description: "AND operator: cmd1 && cmd2",
    pattern: /&&/
  },
  {
    id: "shell-or-operator",
    description: "OR operator: cmd1 || cmd2",
    pattern: /\|\|/
  },
  {
    id: "shell-backtick",
    description: "Backtick command substitution: `cmd`",
    pattern: /`/
  },
  {
    id: "shell-dollar-paren",
    description: "Dollar-paren command substitution: $(cmd)",
    pattern: /\$\(/
  },
  {
    id: "shell-dollar-brace",
    description: "Dollar-brace variable expansion: ${var} \u2014 can be abused for injection",
    pattern: /\$\{/
  },
  {
    id: "shell-redirect-out",
    description: "Output redirection: cmd > file or cmd >> file",
    pattern: />{1,2}/
  },
  {
    id: "shell-redirect-in",
    description: "Input redirection: cmd < file",
    pattern: /</
  },
  {
    id: "shell-newline-injection",
    description: "Newline injection: \\n or \\r \u2014 can inject new shell commands",
    pattern: /[\n\r]/
  },
  {
    id: "shell-glob-star",
    description: "Glob expansion: * or ? \u2014 can expand to unintended files",
    // Only flag when combined with path separators to reduce false positives
    pattern: /[/\\][*?]/
  },
  {
    id: "shell-absolute-root",
    description: "Absolute root path injection: string starting with / or \\ (Windows UNC)",
    pattern: /^(?:\/|\\\\)/
  },
  {
    id: "shell-windows-drive",
    description: "Windows drive letter path injection: C:\\ or D:/",
    pattern: /^[a-zA-Z]:[/\\]/
  },
  {
    id: "shell-curl-wget",
    description: "curl/wget with URL or flags \u2014 can exfiltrate data or download payloads",
    // Require a URL scheme (http/https/ftp) or a flag (-) to reduce false positives
    // "curl is a tool" won't match; "curl http://..." or "curl -s ..." will
    pattern: /\b(?:curl|wget)\s+(?:https?:\/\/|ftp:\/\/|-)/i
  }
];
var shell_default = SHELL_PATTERNS;

// ../node_modules/is-unsafe/src/contexts/redos.js
var REDOS_PATTERNS = [
  {
    id: "redos-nested-quantifier-plus",
    description: "Nested + quantifier inside a group with outer quantifier: (a+)+, (.+b)*, etc.",
    // Matches any group containing a + quantifier, with an outer * or + — catches (a+)+, (.+b)*, etc.
    pattern: /\([^)]*\+[^)]*\)[+*]/
  },
  {
    id: "redos-nested-quantifier-star",
    description: "Nested * quantifier: (a*)* or (a*)+ \u2014 catastrophic backtracking",
    pattern: /\([^)]*\*[^)]*\)[*+]/
  },
  {
    id: "redos-nested-groups",
    description: "Doubly nested quantified groups: ((a+)+) \u2014 guaranteed catastrophic",
    pattern: /\(\([^)]{0,40}\)[+*]\)[+*]/
  },
  {
    id: "redos-alternation-overlap",
    description: "Overlapping alternation under quantifier: (a|a)+ \u2014 ambiguous NFA paths",
    // Detect repeated identical alternatives under a quantifier
    pattern: /\(([^|()]{1,20})\|(?:\1)(?:\|[^|()]{1,20}){0,5}\)[+*?]{1,2}/
  },
  {
    id: "redos-star-plus-concat",
    description: "(x*x)+ pattern \u2014 triggers super-linear backtracking",
    pattern: /\([^)]{0,10}\*[^)]{0,10}\)[+*]/
  },
  {
    id: "redos-dot-star-greedy",
    description: "(.*){n,} or (.+){n,} \u2014 repeated greedy dot quantifiers",
    pattern: /\(\.[*+]\)\{?\d/
  },
  {
    id: "redos-large-repetition",
    description: "Very large fixed or range repetition count {1000,} or {1000,n} \u2014 denial of service via backtracking",
    // Matches { followed by 4+ digits (≥1000), then optional ,digits }
    pattern: /\{\d{4,}(?:,\d*)?\}/
  },
  {
    id: "redos-catastrophic-alternation",
    description: "Long alternation with many similar branches \u2014 polynomial backtracking risk",
    // Heuristic: 10+ pipe-separated alternatives in a single group
    pattern: /\([^)]{0,200}(?:\|[^|)]{0,50}){9,}\)/
  }
];
var redos_default = REDOS_PATTERNS;

// ../node_modules/is-unsafe/src/contexts/nosql.js
var sep = `["'\\s]*:`;
var NOSQL_PATTERNS = [
  // ─── MongoDB $ operator injection ────────────────────────────────────────
  {
    id: "nosql-where-operator",
    description: "$where \u2014 executes arbitrary JavaScript server-side in MongoDB",
    pattern: new RegExp(`\\$where${sep}`, "i")
  },
  {
    id: "nosql-ne-operator",
    description: '$ne \u2014 "not equal" operator used to bypass equality checks',
    pattern: new RegExp(`\\$ne${sep}`, "i")
  },
  {
    id: "nosql-gt-operator",
    description: '$gt \u2014 "greater than" used to bypass password/value checks',
    pattern: new RegExp(`\\$gte?${sep}`, "i")
  },
  {
    id: "nosql-lt-operator",
    description: '$lt / $lte \u2014 "less than" bypass variants',
    pattern: new RegExp(`\\$lte?${sep}`, "i")
  },
  {
    id: "nosql-regex-operator",
    description: "$regex \u2014 can be used to extract data character by character (blind injection)",
    pattern: new RegExp(`\\$regex${sep}`, "i")
  },
  {
    id: "nosql-or-operator",
    description: "$or \u2014 logical OR; used to create always-true conditions",
    pattern: new RegExp(`\\$or${sep}\\s*\\[`, "i")
  },
  {
    id: "nosql-and-operator",
    description: "$and \u2014 logical AND operator injection",
    pattern: new RegExp(`\\$and${sep}\\s*\\[`, "i")
  },
  {
    id: "nosql-nor-operator",
    description: "$nor \u2014 logical NOR operator injection",
    pattern: new RegExp(`\\$nor${sep}\\s*\\[`, "i")
  },
  {
    id: "nosql-exists-operator",
    description: "$exists \u2014 can enumerate fields to determine schema",
    pattern: new RegExp(`\\$exists${sep}`, "i")
  },
  {
    id: "nosql-in-operator",
    description: "$in \u2014 matches any value in a list; can enumerate values",
    pattern: new RegExp(`\\$in${sep}\\s*\\[`, "i")
  },
  {
    id: "nosql-expr-operator",
    description: "$expr \u2014 allows aggregation expressions in queries (MongoDB 3.6+)",
    pattern: new RegExp(`\\$expr${sep}`, "i")
  },
  {
    id: "nosql-function-operator",
    description: "$function \u2014 executes arbitrary JavaScript in MongoDB 4.4+",
    pattern: new RegExp(`\\$function${sep}`, "i")
  },
  {
    id: "nosql-accumulator-operator",
    description: "$accumulator \u2014 custom aggregation with arbitrary JS execution",
    pattern: new RegExp(`\\$accumulator${sep}`, "i")
  },
  // ─── Prototype pollution ─────────────────────────────────────────────────
  {
    id: "nosql-proto-pollution",
    description: "__proto__ \u2014 prototype pollution via object key injection",
    pattern: /__proto__/
  },
  {
    id: "nosql-constructor-prototype",
    description: "constructor.prototype \u2014 alternative prototype pollution vector (dot notation or JSON key)",
    // Matches dot-notation (obj.constructor.prototype) and JSON key adjacency
    // ("constructor": {"prototype": ...})
    pattern: /constructor[\s"':.,{\[]*prototype/i
  },
  {
    id: "nosql-proto-bracket",
    description: '["__proto__"] \u2014 bracket-notation prototype pollution',
    pattern: /\[["']__proto__["']\]/
  }
];
var nosql_default = NOSQL_PATTERNS;

// ../node_modules/is-unsafe/src/contexts/log.js
var LOG_PATTERNS = [
  // ─── CRLF / newline injection ─────────────────────────────────────────────
  {
    id: "log-crlf-injection",
    description: "CRLF injection: literal \\r or \\n embeds fake log lines",
    pattern: /[\r\n]/
  },
  {
    id: "log-url-encoded-crlf",
    description: "URL-encoded CRLF: %0d, %0a, %0D, %0A \u2014 decoded by some log parsers",
    pattern: /%0[dDaA]/
  },
  {
    id: "log-unicode-newline",
    description: "Unicode newline variants: U+2028 (line separator), U+2029 (paragraph separator)",
    pattern: /[\u2028\u2029]/
  },
  // ─── Log4Shell / JNDI injection (CVE-2021-44228) ─────────────────────────
  {
    id: "log-log4shell-jndi",
    description: "Log4Shell: ${jndi:...} triggers remote code execution in Apache Log4j",
    pattern: /\$\{jndi\s*:/i
  },
  {
    id: "log-log4shell-obfuscated",
    description: "Obfuscated Log4Shell: ${::-j}... lookup-bypass prefix used to evade WAF detection",
    // ${::- is the Log4j lookup-bypass escape sequence; presence alone is suspicious
    pattern: /\$\{::-/
  },
  {
    id: "log-log4j-lookup",
    description: "Log4j lookup syntax: ${env:...}, ${sys:...}, ${ctx:...} \u2014 data exfiltration",
    pattern: /\$\{(?:env|sys|ctx|main|map|sd|web|docker|k8s|spring)\s*:/i
  },
  // ─── Server-Side Template Injection (SSTI) in log messages ───────────────
  {
    id: "log-ssti-double-brace",
    description: "SSTI double-brace: {{expression}} \u2014 Jinja2, Twig, Handlebars, etc.",
    pattern: /\{\{[\s\S]{0,80}\}\}/
  },
  {
    id: "log-ssti-hash-brace",
    description: "SSTI hash-brace: #{expression} \u2014 Thymeleaf, Velocity, Ruby ERB",
    pattern: /#\{[\s\S]{0,80}\}/
  },
  {
    id: "log-ssti-dollar-brace",
    description: "SSTI/EL injection: ${expression with operators or method calls} \u2014 JSP EL, Freemarker, SpEL",
    // Require that the ${...} content looks like an expression, not a plain variable name.
    // Flags if the content contains: . ( * + operators, or known SSTI keywords.
    // This avoids flagging ${PATH}, ${HOME} etc. (plain shell variables).
    pattern: /\$\{[^}]*(?:\.|\(|\*|\+|\bclass\b|\bruntime\b|\bprocess\b|\bexec\b)[^}]{0,80}\}/i
  },
  {
    id: "log-ssti-percent-tag",
    description: "SSTI ERB/ASP tag: <%= expression %> \u2014 Ruby ERB, ASP",
    pattern: /<%=[\s\S]{0,80}%>/
  },
  // ─── Null byte ────────────────────────────────────────────────────────────
  {
    id: "log-null-byte",
    description: "Null byte: \\x00 or %00 \u2014 can truncate log entries in C-backed loggers",
    pattern: /\x00|%00/
  },
  // ─── ANSI escape injection ────────────────────────────────────────────────
  {
    id: "log-ansi-escape",
    description: "ANSI escape sequence: ESC[ \u2014 can manipulate terminal output when logs are tailed",
    pattern: /\x1b\[/
  }
];
var log_default = LOG_PATTERNS;

// ../node_modules/is-unsafe/src/contexts/sql-strict.js
var SQL_STRICT_EXTRA = [
  {
    id: "sql-line-comment",
    description: "SQL line comment: -- followed by whitespace or end of string",
    pattern: /--(?:\s|$)/
  },
  {
    id: "sql-stacked-query",
    description: "Stacked queries: semicolon immediately followed by a SQL keyword",
    pattern: /;\s{0,10}(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b/i
  },
  {
    id: "sql-hex-encoding",
    description: "Hex-encoded string injection: 0x41414141 style (MySQL)",
    pattern: /\b0x[0-9a-f]{4,}/i
  }
];
var SQL_STRICT_PATTERNS = [...sql_default, ...SQL_STRICT_EXTRA];
var sql_strict_default = SQL_STRICT_PATTERNS;

// ../node_modules/is-unsafe/src/index.js
html_default.label = "HTML";
xml_default.label = "XML";
svg_default.label = "SVG";
sql_default.label = "SQL";
sql_strict_default.label = "SQL-STRICT";
shell_default.label = "SHELL";
redos_default.label = "REDOS";
nosql_default.label = "NOSQL";
log_default.label = "LOG";
var VALID_CONTEXTS = Object.freeze({
  HTML: html_default,
  XML: xml_default,
  SVG: svg_default,
  SQL: sql_default,
  "SQL-STRICT": sql_strict_default,
  SHELL: shell_default,
  REDOS: redos_default,
  NOSQL: nosql_default,
  LOG: log_default
});
function assertString(value) {
  if (typeof value !== "string") {
    throw new TypeError(
      `is-unsafe: first argument must be a string, got ${typeof value}`
    );
  }
}
function assertContext(context) {
  if (context instanceof RegExp) return;
  if (Array.isArray(context)) {
    if (context.length === 0) {
      throw new TypeError("is-unsafe: context must not be an empty array");
    }
    if (Array.isArray(context[0])) {
      for (const list of context) {
        if (!Array.isArray(list) || list.length === 0) {
          throw new TypeError(
            "is-unsafe: each context in the array must be a non-empty pattern array (PatternList)"
          );
        }
      }
    }
    return;
  }
  throw new TypeError(
    `is-unsafe: second argument must be a PatternList (e.g. HTML), an array of PatternLists (e.g. [HTML, XML]), or a RegExp. Got: ${typeof context}`
  );
}
function normalise(context) {
  if (context instanceof RegExp) return { lists: null, regex: context };
  if (Array.isArray(context[0])) return { lists: context, regex: null };
  return { lists: [context], regex: null };
}
function matchList(value, list) {
  const label = list.label ?? "CUSTOM";
  for (const rule of list) {
    if (rule.pattern.test(value)) {
      return { context: label, id: rule.id, description: rule.description, pattern: rule.pattern };
    }
  }
  return null;
}
function isUnsafe(value, context) {
  assertString(value);
  assertContext(context);
  const { lists, regex } = normalise(context);
  if (regex) return regex.test(value);
  for (const list of lists) {
    if (matchList(value, list) !== null) return true;
  }
  return false;
}

// ../node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js
function extractRawAttributes(prefixedAttrs, options) {
  if (!prefixedAttrs) return {};
  const attrs = options.attributesGroupName ? prefixedAttrs[options.attributesGroupName] : prefixedAttrs;
  if (!attrs) return {};
  const rawAttrs = {};
  for (const key2 in attrs) {
    if (key2.startsWith(options.attributeNamePrefix)) {
      const rawName = key2.substring(options.attributeNamePrefix.length);
      rawAttrs[rawName] = attrs[key2];
    } else {
      rawAttrs[key2] = attrs[key2];
    }
  }
  return rawAttrs;
}
function extractNamespace(rawTagName) {
  if (!rawTagName || typeof rawTagName !== "string") return void 0;
  const colonIndex = rawTagName.indexOf(":");
  if (colonIndex !== -1 && colonIndex > 0) {
    const ns = rawTagName.substring(0, colonIndex);
    if (ns !== "xmlns") {
      return ns;
    }
  }
  return void 0;
}
var OrderedObjParser = class {
  constructor(options, externalEntities) {
    this.options = options;
    this.currentNode = null;
    this.tagsNodeStack = [];
    this.parseXml = parseXml;
    this.parseTextData = parseTextData;
    this.resolveNameSpace = resolveNameSpace;
    this.buildAttributesMap = buildAttributesMap;
    this.isItStopNode = isItStopNode;
    this.replaceEntitiesValue = replaceEntitiesValue;
    this.readStopNodeData = readStopNodeData;
    this.saveTextToParentTag = saveTextToParentTag;
    this.addChild = addChild;
    this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
    this.entityExpansionCount = 0;
    this.currentExpandedLength = 0;
    this.doctypefound = false;
    let namedEntities = { ...XML };
    if (this.options.entityDecoder) {
      this.entityDecoder = this.options.entityDecoder;
    } else {
      if (typeof this.options.htmlEntities === "object") namedEntities = this.options.htmlEntities;
      else if (this.options.htmlEntities === true) namedEntities = { ...COMMON_HTML, ...CURRENCY };
      this.entityDecoder = new EntityDecoder({
        namedEntities: { ...namedEntities, ...externalEntities },
        numericAllowed: this.options.htmlEntities,
        limit: {
          maxTotalExpansions: this.options.processEntities.maxTotalExpansions,
          maxExpandedLength: this.options.processEntities.maxExpandedLength,
          applyLimitsTo: this.options.processEntities.appliesTo
        },
        // onExternalEntity: (name, value) => isUnsafe(value) ? 'block' : 'allow',
        onInputEntity: (name, value) => (
          //TODO: VALID_CONTEXTS.HTML should be set only if this.options.htmlEntities
          isUnsafe(value, [html_default, xml_default]) ? ENTITY_ACTION.BLOCK : ENTITY_ACTION.ALLOW
        )
        //postCheck: resolved => resolved
      });
    }
    this.matcher = new Matcher();
    this.readonlyMatcher = this.matcher.readOnly();
    this.isCurrentNodeStopNode = false;
    this.stopNodeExpressionsSet = new ExpressionSet();
    const stopNodesOpts = this.options.stopNodes;
    if (stopNodesOpts && stopNodesOpts.length > 0) {
      for (let i = 0; i < stopNodesOpts.length; i++) {
        const stopNodeExp = stopNodesOpts[i];
        if (typeof stopNodeExp === "string") {
          this.stopNodeExpressionsSet.add(new Expression(stopNodeExp));
        } else if (stopNodeExp instanceof Expression) {
          this.stopNodeExpressionsSet.add(stopNodeExp);
        }
      }
      this.stopNodeExpressionsSet.seal();
    }
  }
};
function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
  const options = this.options;
  if (val !== void 0) {
    if (options.trimValues && !dontTrim) {
      val = val.trim();
    }
    if (val.length > 0) {
      if (!escapeEntities) val = this.replaceEntitiesValue(val, tagName, jPath);
      const jPathOrMatcher = options.jPath ? jPath.toString() : jPath;
      const newval = options.tagValueProcessor(tagName, val, jPathOrMatcher, hasAttributes, isLeafNode);
      if (newval === null || newval === void 0) {
        return val;
      } else if (typeof newval !== typeof val || newval !== val) {
        return newval;
      } else if (options.trimValues) {
        return parseValue(val, options.parseTagValue, options.numberParseOptions);
      } else {
        const trimmedVal = val.trim();
        if (trimmedVal === val) {
          return parseValue(val, options.parseTagValue, options.numberParseOptions);
        } else {
          return val;
        }
      }
    }
  }
}
function resolveNameSpace(tagname) {
  if (this.options.removeNSPrefix) {
    const tags = tagname.split(":");
    const prefix = tagname.charAt(0) === "/" ? "/" : "";
    if (tags[0] === "xmlns") {
      return "";
    }
    if (tags.length === 2) {
      tagname = prefix + tags[1];
    }
  }
  return tagname;
}
var attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
function buildAttributesMap(attrStr, jPath, tagName, force = false) {
  const options = this.options;
  if (force === true || options.ignoreAttributes !== true && typeof attrStr === "string") {
    const matches = getAllMatches(attrStr, attrsRegx);
    const len = matches.length;
    const attrs = {};
    const processedVals = new Array(len);
    let hasRawAttrs = false;
    const rawAttrsForMatcher = {};
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      const oldVal = matches[i][4];
      if (attrName.length && oldVal !== void 0) {
        let val = oldVal;
        if (options.trimValues) val = val.trim();
        val = this.replaceEntitiesValue(val, tagName, this.readonlyMatcher);
        processedVals[i] = val;
        rawAttrsForMatcher[attrName] = val;
        hasRawAttrs = true;
      }
    }
    if (hasRawAttrs && typeof jPath === "object" && jPath.updateCurrent) {
      jPath.updateCurrent(rawAttrsForMatcher);
    }
    const jPathStr = options.jPath ? jPath.toString() : this.readonlyMatcher;
    let hasAttrs = false;
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      if (this.ignoreAttributesFn(attrName, jPathStr)) continue;
      let aName = options.attributeNamePrefix + attrName;
      if (attrName.length) {
        if (options.transformAttributeName) {
          aName = options.transformAttributeName(aName);
        }
        aName = sanitizeName(aName, options);
        if (matches[i][4] !== void 0) {
          const oldVal = processedVals[i];
          const newVal = options.attributeValueProcessor(attrName, oldVal, jPathStr);
          if (newVal === null || newVal === void 0) {
            attrs[aName] = oldVal;
          } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
            attrs[aName] = newVal;
          } else {
            attrs[aName] = parseValue(oldVal, options.parseAttributeValue, options.numberParseOptions);
          }
          hasAttrs = true;
        } else if (options.allowBooleanAttributes) {
          attrs[aName] = true;
          hasAttrs = true;
        }
      }
    }
    if (!hasAttrs) return;
    if (options.attributesGroupName && !options.preserveOrder) {
      const attrCollection = {};
      attrCollection[options.attributesGroupName] = attrs;
      return attrCollection;
    }
    return attrs;
  }
}
var parseXml = function(xmlData) {
  xmlData = xmlData.replace(/\r\n?/g, "\n");
  const xmlObj = new XmlNode("!xml");
  let currentNode = xmlObj;
  let textData = "";
  this.matcher.reset();
  this.entityDecoder.reset();
  this.entityExpansionCount = 0;
  this.currentExpandedLength = 0;
  this.doctypefound = false;
  const options = this.options;
  const docTypeReader = new DocTypeReader(options.processEntities);
  const xmlLen = xmlData.length;
  for (let i = 0; i < xmlLen; i++) {
    const ch = xmlData[i];
    if (ch === "<") {
      const c1 = xmlData.charCodeAt(i + 1);
      if (c1 === 47) {
        const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
        let tagName = xmlData.substring(i + 2, closeIndex).trim();
        if (options.removeNSPrefix) {
          const colonIndex = tagName.indexOf(":");
          if (colonIndex !== -1) {
            tagName = tagName.substr(colonIndex + 1);
          }
        }
        tagName = transformTagName(options.transformTagName, tagName, "", options).tagName;
        if (currentNode) {
          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
        }
        const lastTagName = this.matcher.getCurrentTag();
        if (tagName && options.unpairedTagsSet.has(tagName)) {
          throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
        }
        if (lastTagName && options.unpairedTagsSet.has(lastTagName)) {
          this.matcher.pop();
          this.tagsNodeStack.pop();
        }
        this.matcher.pop();
        this.isCurrentNodeStopNode = false;
        currentNode = this.tagsNodeStack.pop();
        textData = "";
        i = closeIndex;
      } else if (c1 === 63) {
        let tagData = readTagExp(xmlData, i, false, "?>");
        if (!tagData) throw new Error("Pi Tag is not closed.");
        textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
        const attsMap = this.buildAttributesMap(tagData.tagExp, this.matcher, tagData.tagName, true);
        if (attsMap) {
          const ver = attsMap[this.options.attributeNamePrefix + "version"];
          this.entityDecoder.setXmlVersion(Number(ver) || 1);
          docTypeReader.setXmlVersion(Number(ver) || 1);
        }
        if (options.ignoreDeclaration && tagData.tagName === "?xml" || options.ignorePiTags) {
        } else {
          const childNode = new XmlNode(tagData.tagName);
          childNode.add(options.textNodeName, "");
          if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent && options.ignoreAttributes !== true) {
            childNode[":@"] = attsMap;
          }
          this.addChild(currentNode, childNode, this.readonlyMatcher, i);
        }
        i = tagData.closeIndex + 1;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
        const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
        if (options.commentPropName) {
          const comment = xmlData.substring(i + 4, endIndex - 2);
          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
          currentNode.add(options.commentPropName, [{ [options.textNodeName]: comment }]);
        }
        i = endIndex;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 68) {
        if (this.doctypefound) throw new Error("Multiple DOCTYPE declarations found.");
        this.doctypefound = true;
        const result2 = docTypeReader.readDocType(xmlData, i);
        this.entityDecoder.addInputEntities(result2.entities);
        i = result2.i;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
        const tagExp = xmlData.substring(i + 9, closeIndex);
        textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
        let val = this.parseTextData(tagExp, currentNode.tagname, this.readonlyMatcher, true, false, true, true);
        if (val == void 0) val = "";
        if (options.cdataPropName) {
          currentNode.add(options.cdataPropName, [{ [options.textNodeName]: tagExp }]);
        } else {
          currentNode.add(options.textNodeName, val);
        }
        i = closeIndex + 2;
      } else {
        let result2 = readTagExp(xmlData, i, options.removeNSPrefix);
        if (!result2) {
          const context = xmlData.substring(Math.max(0, i - 50), Math.min(xmlLen, i + 50));
          throw new Error(`readTagExp returned undefined at position ${i}. Context: "${context}"`);
        }
        let tagName = result2.tagName;
        const rawTagName = result2.rawTagName;
        let tagExp = result2.tagExp;
        let attrExpPresent = result2.attrExpPresent;
        let closeIndex = result2.closeIndex;
        ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
        if (options.strictReservedNames && (tagName === options.commentPropName || tagName === options.cdataPropName || tagName === options.textNodeName || tagName === options.attributesGroupName)) {
          throw new Error(`Invalid tag name: ${tagName}`);
        }
        if (currentNode && textData) {
          if (currentNode.tagname !== "!xml") {
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher, false);
          }
        }
        const lastTag = currentNode;
        if (lastTag && options.unpairedTagsSet.has(lastTag.tagname)) {
          currentNode = this.tagsNodeStack.pop();
          this.matcher.pop();
        }
        let isSelfClosing = false;
        if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
          isSelfClosing = true;
          if (tagName[tagName.length - 1] === "/") {
            tagName = tagName.substr(0, tagName.length - 1);
            tagExp = tagName;
          } else {
            tagExp = tagExp.substr(0, tagExp.length - 1);
          }
          attrExpPresent = tagName !== tagExp;
        }
        let prefixedAttrs = null;
        let rawAttrs = {};
        let namespace = void 0;
        namespace = extractNamespace(rawTagName);
        if (tagName !== xmlObj.tagname) {
          this.matcher.push(tagName, {}, namespace);
        }
        if (tagName !== tagExp && attrExpPresent) {
          prefixedAttrs = this.buildAttributesMap(tagExp, this.matcher, tagName);
          if (prefixedAttrs) {
            rawAttrs = extractRawAttributes(prefixedAttrs, options);
          }
        }
        if (tagName !== xmlObj.tagname) {
          this.isCurrentNodeStopNode = this.isItStopNode();
        }
        const startIndex = i;
        if (this.isCurrentNodeStopNode) {
          let tagContent = "";
          if (isSelfClosing) {
            i = result2.closeIndex;
          } else if (options.unpairedTagsSet.has(tagName)) {
            i = result2.closeIndex;
          } else {
            const result3 = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
            if (!result3) throw new Error(`Unexpected end of ${rawTagName}`);
            i = result3.i;
            tagContent = result3.tagContent;
          }
          const childNode = new XmlNode(tagName);
          if (prefixedAttrs) {
            childNode[":@"] = prefixedAttrs;
          }
          childNode.add(options.textNodeName, tagContent);
          this.matcher.pop();
          this.isCurrentNodeStopNode = false;
          this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
        } else {
          if (isSelfClosing) {
            ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
            const childNode = new XmlNode(tagName);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            this.matcher.pop();
            this.isCurrentNodeStopNode = false;
          } else if (options.unpairedTagsSet.has(tagName)) {
            const childNode = new XmlNode(tagName);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            this.matcher.pop();
            this.isCurrentNodeStopNode = false;
            i = result2.closeIndex;
            continue;
          } else {
            const childNode = new XmlNode(tagName);
            if (this.tagsNodeStack.length > options.maxNestedTags) {
              throw new Error("Maximum nested tags exceeded");
            }
            this.tagsNodeStack.push(currentNode);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            currentNode = childNode;
          }
          textData = "";
          i = closeIndex;
        }
      }
    } else {
      textData += xmlData[i];
    }
  }
  return xmlObj.child;
};
function addChild(currentNode, childNode, matcher, startIndex) {
  if (!this.options.captureMetaData) startIndex = void 0;
  const jPathOrMatcher = this.options.jPath ? matcher.toString() : matcher;
  const result2 = this.options.updateTag(childNode.tagname, jPathOrMatcher, childNode[":@"]);
  if (result2 === false) {
  } else if (typeof result2 === "string") {
    childNode.tagname = result2;
    currentNode.addChild(childNode, startIndex);
  } else {
    currentNode.addChild(childNode, startIndex);
  }
}
function replaceEntitiesValue(val, tagName, jPath) {
  const entityConfig = this.options.processEntities;
  if (!entityConfig || !entityConfig.enabled) {
    return val;
  }
  if (entityConfig.allowedTags) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    const allowed = Array.isArray(entityConfig.allowedTags) ? entityConfig.allowedTags.includes(tagName) : entityConfig.allowedTags(tagName, jPathOrMatcher);
    if (!allowed) {
      return val;
    }
  }
  if (entityConfig.tagFilter) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    if (!entityConfig.tagFilter(tagName, jPathOrMatcher)) {
      return val;
    }
  }
  return this.entityDecoder.decode(val);
}
function saveTextToParentTag(textData, parentNode, matcher, isLeafNode) {
  if (textData) {
    if (isLeafNode === void 0) isLeafNode = parentNode.child.length === 0;
    textData = this.parseTextData(
      textData,
      parentNode.tagname,
      matcher,
      false,
      parentNode[":@"] ? Object.keys(parentNode[":@"]).length !== 0 : false,
      isLeafNode
    );
    if (textData !== void 0 && textData !== "")
      parentNode.add(this.options.textNodeName, textData);
    textData = "";
  }
  return textData;
}
function isItStopNode() {
  if (this.stopNodeExpressionsSet.size === 0) return false;
  return this.matcher.matchesAny(this.stopNodeExpressionsSet);
}
function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
  let attrBoundary = 0;
  const len = xmlData.length;
  const closeCode0 = closingChar.charCodeAt(0);
  const closeCode1 = closingChar.length > 1 ? closingChar.charCodeAt(1) : -1;
  let result2 = "";
  let segmentStart = i;
  for (let index = i; index < len; index++) {
    const code = xmlData.charCodeAt(index);
    if (attrBoundary) {
      if (code === attrBoundary) attrBoundary = 0;
    } else if (code === 34 || code === 39) {
      attrBoundary = code;
    } else if (code === closeCode0) {
      if (closeCode1 !== -1) {
        if (xmlData.charCodeAt(index + 1) === closeCode1) {
          result2 += xmlData.substring(segmentStart, index);
          return { data: result2, index };
        }
      } else {
        result2 += xmlData.substring(segmentStart, index);
        return { data: result2, index };
      }
    } else if (code === 9 && !attrBoundary) {
      result2 += xmlData.substring(segmentStart, index) + " ";
      segmentStart = index + 1;
    }
  }
}
function findClosingIndex(xmlData, str, i, errMsg) {
  const closingIndex = xmlData.indexOf(str, i);
  if (closingIndex === -1) {
    throw new Error(errMsg);
  } else {
    return closingIndex + str.length - 1;
  }
}
function findClosingChar(xmlData, char, i, errMsg) {
  const closingIndex = xmlData.indexOf(char, i);
  if (closingIndex === -1) throw new Error(errMsg);
  return closingIndex;
}
function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
  const result2 = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
  if (!result2) return;
  let tagExp = result2.data;
  const closeIndex = result2.index;
  const separatorIndex = tagExp.search(/\s/);
  let tagName = tagExp;
  let attrExpPresent = true;
  if (separatorIndex !== -1) {
    tagName = tagExp.substring(0, separatorIndex);
    tagExp = tagExp.substring(separatorIndex + 1).trimStart();
  }
  const rawTagName = tagName;
  if (removeNSPrefix) {
    const colonIndex = tagName.indexOf(":");
    if (colonIndex !== -1) {
      tagName = tagName.substr(colonIndex + 1);
      attrExpPresent = tagName !== result2.data.substr(colonIndex + 1);
    }
  }
  return {
    tagName,
    tagExp,
    closeIndex,
    attrExpPresent,
    rawTagName
  };
}
function readStopNodeData(xmlData, tagName, i) {
  const startIndex = i;
  let openTagCount = 1;
  const xmllen = xmlData.length;
  for (; i < xmllen; i++) {
    if (xmlData[i] === "<") {
      const c1 = xmlData.charCodeAt(i + 1);
      if (c1 === 47) {
        const closeIndex = findClosingChar(xmlData, ">", i, `${tagName} is not closed`);
        let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
        if (closeTagName === tagName) {
          openTagCount--;
          if (openTagCount === 0) {
            return {
              tagContent: xmlData.substring(startIndex, i),
              i: closeIndex
            };
          }
        }
        i = closeIndex;
      } else if (c1 === 63) {
        const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
        i = closeIndex;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
        const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
        i = closeIndex;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
        i = closeIndex;
      } else {
        const tagData = readTagExp(xmlData, i, false);
        if (tagData) {
          const openTagName = tagData && tagData.tagName;
          if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
            openTagCount++;
          }
          i = tagData.closeIndex;
        }
      }
    }
  }
}
function parseValue(val, shouldParse, options) {
  if (shouldParse && typeof val === "string") {
    const newval = val.trim();
    if (newval === "true") return true;
    else if (newval === "false") return false;
    else return toNumber(val, options);
  } else {
    if (isExist(val)) {
      return val;
    } else {
      return "";
    }
  }
}
function transformTagName(fn, tagName, tagExp, options) {
  if (fn) {
    const newTagName = fn(tagName);
    if (tagExp === tagName) {
      tagExp = newTagName;
    }
    tagName = newTagName;
  }
  tagName = sanitizeName(tagName, options);
  return { tagName, tagExp };
}
function sanitizeName(name, options) {
  if (criticalProperties.includes(name)) {
    throw new Error(`[SECURITY] Invalid name: "${name}" is a reserved JavaScript keyword that could cause prototype pollution`);
  } else if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return options.onDangerousProperty(name);
  }
  return name;
}

// ../node_modules/fast-xml-parser/src/xmlparser/node2json.js
var METADATA_SYMBOL2 = XmlNode.getMetaDataSymbol();
function stripAttributePrefix(attrs, prefix) {
  if (!attrs || typeof attrs !== "object") return {};
  if (!prefix) return attrs;
  const rawAttrs = {};
  for (const key2 in attrs) {
    if (key2.startsWith(prefix)) {
      const rawName = key2.substring(prefix.length);
      rawAttrs[rawName] = attrs[key2];
    } else {
      rawAttrs[key2] = attrs[key2];
    }
  }
  return rawAttrs;
}
function prettify(node, options, matcher, readonlyMatcher) {
  return compress(node, options, matcher, readonlyMatcher);
}
function compress(arr, options, matcher, readonlyMatcher) {
  let text;
  const compressedObj = {};
  for (let i = 0; i < arr.length; i++) {
    const tagObj = arr[i];
    const property = propName(tagObj);
    if (property !== void 0 && property !== options.textNodeName) {
      const rawAttrs = stripAttributePrefix(
        tagObj[":@"] || {},
        options.attributeNamePrefix
      );
      matcher.push(property, rawAttrs);
    }
    if (property === options.textNodeName) {
      if (text === void 0) text = tagObj[property];
      else text += "" + tagObj[property];
    } else if (property === void 0) {
      continue;
    } else if (tagObj[property]) {
      let val = compress(tagObj[property], options, matcher, readonlyMatcher);
      const isLeaf = isLeafTag(val, options);
      if (Object.keys(val).length === 0 && options.alwaysCreateTextNode) {
        val[options.textNodeName] = "";
      }
      if (tagObj[":@"]) {
        assignAttributes(val, tagObj[":@"], readonlyMatcher, options);
      } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== void 0 && !options.alwaysCreateTextNode) {
        val = val[options.textNodeName];
      } else if (Object.keys(val).length === 0) {
        if (options.alwaysCreateTextNode) val[options.textNodeName] = "";
        else val = "";
      }
      if (tagObj[METADATA_SYMBOL2] !== void 0 && typeof val === "object" && val !== null) {
        val[METADATA_SYMBOL2] = tagObj[METADATA_SYMBOL2];
      }
      if (compressedObj[property] !== void 0 && Object.prototype.hasOwnProperty.call(compressedObj, property)) {
        if (!Array.isArray(compressedObj[property])) {
          compressedObj[property] = [compressedObj[property]];
        }
        compressedObj[property].push(val);
      } else {
        const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() : readonlyMatcher;
        if (options.isArray(property, jPathOrMatcher, isLeaf)) {
          compressedObj[property] = [val];
        } else {
          compressedObj[property] = val;
        }
      }
      if (property !== void 0 && property !== options.textNodeName) {
        matcher.pop();
      }
    }
  }
  if (typeof text === "string") {
    if (text.length > 0) compressedObj[options.textNodeName] = text;
  } else if (text !== void 0) compressedObj[options.textNodeName] = text;
  return compressedObj;
}
function propName(obj) {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key2 = keys[i];
    if (key2 !== ":@") return key2;
  }
}
function assignAttributes(obj, attrMap, readonlyMatcher, options) {
  if (attrMap) {
    const keys = Object.keys(attrMap);
    const len = keys.length;
    for (let i = 0; i < len; i++) {
      const atrrName = keys[i];
      const rawAttrName = atrrName.startsWith(options.attributeNamePrefix) ? atrrName.substring(options.attributeNamePrefix.length) : atrrName;
      const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() + "." + rawAttrName : readonlyMatcher;
      if (options.isArray(atrrName, jPathOrMatcher, true, true)) {
        obj[atrrName] = [attrMap[atrrName]];
      } else {
        obj[atrrName] = attrMap[atrrName];
      }
    }
  }
}
function isLeafTag(obj, options) {
  const { textNodeName } = options;
  const propCount = Object.keys(obj).length;
  if (propCount === 0) {
    return true;
  }
  if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) {
    return true;
  }
  return false;
}

// ../node_modules/fast-xml-parser/src/xmlparser/XMLParser.js
var XMLParser = class {
  constructor(options) {
    this.externalEntities = {};
    this.options = buildOptions(options);
  }
  /**
   * Parse XML dats to JS object 
   * @param {string|Uint8Array} xmlData 
   * @param {boolean|Object} validationOption 
   */
  parse(xmlData, validationOption) {
    if (typeof xmlData !== "string" && xmlData.toString) {
      xmlData = xmlData.toString();
    } else if (typeof xmlData !== "string") {
      throw new Error("XML data is accepted in String or Bytes[] form.");
    }
    if (validationOption) {
      if (validationOption === true) validationOption = {};
      const result2 = validate(xmlData, validationOption);
      if (result2 !== true) {
        throw Error(`${result2.err.msg}:${result2.err.line}:${result2.err.col}`);
      }
    }
    const orderedObjParser = new OrderedObjParser(this.options, this.externalEntities);
    const orderedResult = orderedObjParser.parseXml(xmlData);
    if (this.options.preserveOrder || orderedResult === void 0) return orderedResult;
    else return prettify(orderedResult, this.options, orderedObjParser.matcher, orderedObjParser.readonlyMatcher);
  }
  /**
   * Add Entity which is not by default supported by this library
   * @param {string} key 
   * @param {string} value 
   */
  addEntity(key2, value) {
    if (value.indexOf("&") !== -1) {
      throw new Error("Entity value can't have '&'");
    } else if (key2.indexOf("&") !== -1 || key2.indexOf(";") !== -1) {
      throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
    } else if (value === "&") {
      throw new Error("An entity with value '&' is not permitted");
    } else {
      this.externalEntities[key2] = value;
    }
  }
  /**
   * Returns a Symbol that can be used to access the metadata
   * property on a node.
   * 
   * If Symbol is not available in the environment, an ordinary property is used
   * and the name of the property is here returned.
   * 
   * The XMLMetaData property is only present when `captureMetaData`
   * is true in the options.
   */
  static getMetaDataSymbol() {
    return XmlNode.getMetaDataSymbol();
  }
};

// src/discovery/onvif-discovery.ts
var multicastAddress = "239.255.255.250";
var multicastPort = 3702;
async function discoverOnvifDevices(timeoutMs = 5e3) {
  const socket = import_node_dgram.default.createSocket({ type: "udp4", reuseAddr: true });
  const message = Buffer.from(probeEnvelope((0, import_node_crypto.randomUUID)()));
  const found = /* @__PURE__ */ new Map();
  return new Promise((resolve3, reject) => {
    const finish = () => {
      socket.close();
      resolve3([...found.values()]);
    };
    const timer = setTimeout(finish, timeoutMs);
    socket.on("error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
    socket.on("message", (buffer, remote) => {
      const parsed = parseProbeMatch(buffer.toString("utf8"), remote.address);
      if (!parsed) return;
      const key2 = parsed.endpointReference ?? parsed.xaddrs.join("|");
      found.set(key2, parsed);
    });
    socket.bind(0, () => {
      socket.setBroadcast(true);
      socket.setMulticastTTL(2);
      socket.send(message, multicastPort, multicastAddress);
    });
  });
}
function parseProbeMatch(xml, remoteAddress) {
  const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false });
  const document = parser.parse(xml);
  const body = nested(document, "Envelope", "Body");
  const matches = nested(body, "ProbeMatches", "ProbeMatch");
  const match = Array.isArray(matches) ? matches[0] : matches;
  if (!isRecord(match)) return null;
  const xaddrText = stringValue(match.XAddrs);
  if (!xaddrText) return null;
  const endpoint = nested(match, "EndpointReference", "Address");
  const scopes = stringValue(match.Scopes);
  const types = stringValue(match.Types);
  return {
    endpointReference: stringValue(endpoint),
    xaddrs: xaddrText.split(/\s+/).filter(Boolean),
    scopes: scopes?.split(/\s+/).filter(Boolean) ?? [],
    types: types?.split(/\s+/).filter(Boolean) ?? [],
    remoteAddress
  };
}
function probeEnvelope(messageId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
 xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
 xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
 xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
 <e:Header>
  <w:MessageID>uuid:${messageId}</w:MessageID>
  <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
  <w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
 </e:Header>
 <e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter dn:NetworkVideoStorage</d:Types></d:Probe></e:Body>
</e:Envelope>`;
}
function nested(value, ...keys) {
  let current = value;
  for (const key2 of keys) {
    if (!isRecord(current)) return void 0;
    current = current[key2];
  }
  return current;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function stringValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (isRecord(value) && typeof value["#text"] === "string") return value["#text"];
  return null;
}

// src/devices/onvif-client.ts
var import_node_crypto2 = require("node:crypto");
var OnvifClient = class {
  constructor(deviceServiceUrl, credentials, timeoutMs = 8e3) {
    this.deviceServiceUrl = deviceServiceUrl;
    this.credentials = credentials;
    this.timeoutMs = timeoutMs;
  }
  parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: false,
    parseTagValue: true
  });
  async inspect() {
    const info = await this.call(
      this.deviceServiceUrl,
      "http://www.onvif.org/ver10/device/wsdl/GetDeviceInformation",
      `<tds:GetDeviceInformation/>`,
      `xmlns:tds="http://www.onvif.org/ver10/device/wsdl"`
    );
    const capabilities = await this.call(
      this.deviceServiceUrl,
      "http://www.onvif.org/ver10/device/wsdl/GetCapabilities",
      `<tds:GetCapabilities><tds:Category>All</tds:Category></tds:GetCapabilities>`,
      `xmlns:tds="http://www.onvif.org/ver10/device/wsdl"`
    );
    const infoResponse = findRecord(info, "GetDeviceInformationResponse");
    const caps = findRecord(capabilities, "Capabilities");
    const media = recordValue(caps?.Media);
    const mediaServiceUrl = textValue(media?.["@_XAddr"]) ?? textValue(media?.XAddr);
    if (!mediaServiceUrl) throw new Error("ONVIF device did not provide a media service URL");
    const profileDocument = await this.call(
      mediaServiceUrl,
      "http://www.onvif.org/ver10/media/wsdl/GetProfiles",
      `<trt:GetProfiles/>`,
      `xmlns:trt="http://www.onvif.org/ver10/media/wsdl"`
    );
    const profileResponse = findRecord(profileDocument, "GetProfilesResponse");
    const rawProfiles = arrayValue(profileResponse?.Profiles);
    const profiles = rawProfiles.map(parseProfile).filter((item) => Boolean(item));
    const services = buildServices(caps, Boolean(mediaServiceUrl), profiles.length > 0);
    const capabilityTests = buildCapabilityTests({
      manufacturer: textValue(infoResponse?.Manufacturer) ?? "unknown",
      model: textValue(infoResponse?.Model) ?? "unknown",
      firmwareVersion: textValue(infoResponse?.FirmwareVersion) ?? "unknown",
      serialNumber: textValue(infoResponse?.SerialNumber) ?? "unknown",
      services,
      profiles,
      capabilities: {
        ptz: Boolean(caps?.PTZ),
        audio: rawProfiles.some(hasAudioEncoder),
        events: Boolean(caps?.Events)
      }
    });
    return {
      manufacturer: textValue(infoResponse?.Manufacturer) ?? "unknown",
      model: textValue(infoResponse?.Model) ?? "unknown",
      firmwareVersion: textValue(infoResponse?.FirmwareVersion) ?? "unknown",
      serialNumber: textValue(infoResponse?.SerialNumber) ?? "unknown",
      mediaServiceUrl,
      profiles,
      capabilities: {
        ptz: Boolean(caps?.PTZ),
        audio: rawProfiles.some(hasAudioEncoder),
        events: Boolean(caps?.Events)
      },
      services,
      capabilityTests
    };
  }
  async getStreamUri(mediaServiceUrl, profileToken) {
    const document = await this.call(
      mediaServiceUrl,
      "http://www.onvif.org/ver10/media/wsdl/GetStreamUri",
      `<trt:GetStreamUri>
        <trt:StreamSetup>
          <tt:Stream>RTP-Unicast</tt:Stream>
          <tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport>
        </trt:StreamSetup>
        <trt:ProfileToken>${escapeXml(profileToken)}</trt:ProfileToken>
      </trt:GetStreamUri>`,
      `xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
       xmlns:tt="http://www.onvif.org/ver10/schema"`
    );
    const response = findRecord(document, "GetStreamUriResponse");
    const mediaUri = recordValue(response?.MediaUri);
    const uri = textValue(mediaUri?.Uri);
    if (!uri) throw new Error("ONVIF profile did not return an RTSP URI");
    return uri;
  }
  async call(url, action, body, namespaces) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": `application/soap+xml; charset=utf-8; action="${action}"`
        },
        body: soapEnvelope(body, namespaces, this.credentials),
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`ONVIF request failed (${response.status}): ${text.slice(0, 1200)}`);
      }
      const parsed = this.parser.parse(text);
      const fault = findRecord(parsed, "Fault");
      if (fault) throw new Error(`ONVIF SOAP fault: ${JSON.stringify(fault).slice(0, 300)}`);
      return parsed;
    } finally {
      clearTimeout(timeout);
    }
  }
};
function attachCredentials(uri, credentials) {
  const parsed = new URL(uri);
  parsed.username = credentials.username;
  parsed.password = credentials.password;
  return parsed.toString();
}
function soapEnvelope(body, namespaces, credentials) {
  if (credentials.password === "") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
 ${namespaces}>
 <s:Body>${body}</s:Body>
</s:Envelope>`;
  }
  const nonce = (0, import_node_crypto2.randomBytes)(20);
  const created = (/* @__PURE__ */ new Date()).toISOString();
  const digest = (0, import_node_crypto2.createHash)("sha1").update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(credentials.password)])).digest("base64");
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
 xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
 xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"
 ${namespaces}>
 <s:Header>
  <wsse:Security s:mustUnderstand="1">
   <wsse:UsernameToken>
    <wsse:Username>${escapeXml(credentials.username)}</wsse:Username>
    <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password>
    <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce.toString("base64")}</wsse:Nonce>
    <wsu:Created>${created}</wsu:Created>
   </wsse:UsernameToken>
  </wsse:Security>
 </s:Header>
 <s:Body>${body}</s:Body>
</s:Envelope>`;
}
function parseProfile(value) {
  const profile = recordValue(value);
  if (!profile) return null;
  const encoder = recordValue(profile.VideoEncoderConfiguration);
  const resolution = recordValue(encoder?.Resolution);
  const token = textValue(profile["@_token"]);
  if (!token) return null;
  const encoding = (textValue(encoder?.Encoding) ?? "unknown").toUpperCase();
  const codec = encoding === "H264" || encoding === "H265" || encoding === "MJPEG" ? encoding : "unknown";
  return {
    token,
    name: textValue(profile.Name) ?? token,
    codec,
    width: numberValue(resolution?.Width),
    height: numberValue(resolution?.Height)
  };
}
function hasAudioEncoder(value) {
  return Boolean(recordValue(value)?.AudioEncoderConfiguration);
}
function buildServices(caps, hasMediaService, hasProfiles) {
  const services = ["DeviceManagement"];
  if (hasMediaService) {
    services.push("Media");
    if (hasProfiles) services.push("Media2");
  }
  if (Boolean(caps?.PTZ)) services.push("PTZ");
  if (Boolean(caps?.Events)) services.push("Events");
  if (Boolean(caps?.Imaging)) services.push("Imaging");
  if (Boolean(caps?.Analytics)) services.push("Analytics");
  if (Boolean(caps?.Recording)) services.push("Recording");
  if (Boolean(caps?.DeviceIO)) services.push("DeviceIO");
  if (Boolean(caps?.Replay)) services.push("Replay");
  return services;
}
function buildCapabilityTests(input) {
  const hasH264 = input.profiles.some((profile) => profile.codec === "H264");
  const hasH265 = input.profiles.some((profile) => profile.codec === "H265");
  return [
    { name: "ONVIF authentication", status: "pass", detail: "Authenticated SOAP calls succeeded" },
    { name: "Device information", status: "pass", detail: `${input.manufacturer} ${input.model}` },
    { name: "Media profiles", status: input.profiles.length > 0 ? "pass" : "fail", detail: input.profiles.length > 0 ? `${input.profiles.length} profile(s) discovered` : "No media profiles returned" },
    { name: "RTSP URI", status: "pass", detail: "Stream URI request completed" },
    { name: "H.264", status: hasH264 ? "pass" : "unsupported", detail: hasH264 ? "H.264 profile available" : "No H.264 profile exposed" },
    { name: "H.265", status: hasH265 ? "pass" : "unsupported", detail: hasH265 ? "H.265 profile available" : "No H.265 profile exposed" },
    { name: "PTZ", status: input.capabilities.ptz ? "pass" : "unsupported", detail: input.capabilities.ptz ? "PTZ service exposed" : "PTZ service not exposed" },
    { name: "Events", status: input.capabilities.events ? "pass" : "unsupported", detail: input.capabilities.events ? "Event service available" : "Event service unavailable" },
    { name: "Imaging control", status: input.services.includes("Imaging") ? "pass" : "unsupported", detail: input.services.includes("Imaging") ? "Imaging service available" : "Imaging service unavailable" },
    { name: "Firmware upgrade", status: input.firmwareVersion && input.firmwareVersion !== "unknown" ? "vendor-specific" : "unsupported", detail: input.firmwareVersion && input.firmwareVersion !== "unknown" ? "Vendor-specific upgrade path required" : "Firmware version unavailable" }
  ];
}
function findRecord(value, key2) {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findRecord(child, key2);
      if (found) return found;
    }
    return void 0;
  }
  const record = recordValue(value);
  if (!record) return void 0;
  const direct = recordValue(record[key2]);
  if (direct) return direct;
  for (const child of Object.values(record)) {
    const found = findRecord(child, key2);
    if (found) return found;
  }
  return void 0;
}
function recordValue(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function arrayValue(value) {
  if (value === void 0) return [];
  return Array.isArray(value) ? value : [value];
}
function textValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}
function numberValue(value) {
  const number2 = Number(value);
  return Number.isFinite(number2) ? number2 : 0;
}
function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

// src/devices/compatibility-registry.ts
function normalizeVendor(manufacturer) {
  const value = manufacturer.trim().toLowerCase();
  if (value.includes("hikvision")) return "hikvision";
  if (value.includes("cp plus") || value.includes("cp-plus")) return "cp-plus";
  return "other";
}
function compatibilityNotes(vendor) {
  switch (vendor) {
    case "hikvision":
      return ["Prefer ONVIF Profile T", "Use ISAPI only for unsupported events"];
    case "cp-plus":
      return ["Confirm ONVIF profile support for the exact firmware"];
    default:
      return ["Use ONVIF capability results; do not infer features by brand"];
  }
}

// src/registration/gateway-client.ts
var GatewayClient = class {
  constructor(baseUrl, developmentUserId, edgeBridgeSharedKey, timeoutMs = 15e3, outbox) {
    this.baseUrl = baseUrl;
    this.developmentUserId = developmentUserId;
    this.edgeBridgeSharedKey = edgeBridgeSharedKey;
    this.timeoutMs = timeoutMs;
    this.outbox = outbox;
  }
  edgeCredential;
  useEdgeCredential(credential) {
    this.edgeCredential = credential;
  }
  async activate(activationCode, deviceUuid, version, commandPublicKey) {
    return this.request("/v1/edge-enrollment/activate", {
      method: "POST",
      body: JSON.stringify({ activationCode, deviceUuid, version, commandPublicKey })
    }, true);
  }
  async getBootstrap(agentId) {
    return this.request(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/bootstrap`,
      { method: "GET" }
    );
  }
  async register(branchId, name, version) {
    return this.request(
      `/v1/branches/${encodeURIComponent(branchId)}/edge-agents/register`,
      { method: "POST", body: JSON.stringify({ name, version }) }
    );
  }
  async heartbeat(id, version, publicMediaUrl) {
    return this.request(
      `/v1/edge-agents/${encodeURIComponent(id)}/heartbeat`,
      {
        method: "POST",
        body: JSON.stringify({
          version,
          ...publicMediaUrl ? { publicMediaUrl } : {}
        })
      }
    );
  }
  async listMonitoringCameras(agentId, version) {
    const response = await this.request(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/cameras/monitoring`,
      { method: "GET", headers: { "x-edge-agent-version": version } }
    );
    return response.data;
  }
  async submitTelemetry(agentId, payload) {
    return this.requestOrQueue(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/telemetry`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  }
  async submitRecorderHdd(agentId, payload) {
    return this.requestOrQueue(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/recorder-hdd`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  }
  async submitRecorderArchive(agentId, payload) {
    return this.requestOrQueue(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/recorder-archive`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  }
  async submitDiscovery(branchId, payload) {
    return this.request(
      `/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered`,
      { method: "POST", body: JSON.stringify(payload) }
    );
  }
  async claimScanJob(agentId, version) {
    return this.request(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/scan-jobs/next`,
      { method: "GET", headers: { "x-edge-agent-version": version } }
    );
  }
  async completeScanJob(agentId, jobId, result2) {
    return this.request(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/scan-jobs/${encodeURIComponent(jobId)}/complete`,
      { method: "POST", body: JSON.stringify(result2) }
    );
  }
  async consumeLiveSession(agentId, token) {
    return this.request(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/live-sessions/consume`,
      { method: "POST", body: JSON.stringify({ token }) }
    );
  }
  async claimCommand(agentId) {
    return this.request(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/commands/next`,
      { method: "GET" }
    );
  }
  async completeCommand(agentId, commandId, result2) {
    return this.requestOrQueue(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/commands/${encodeURIComponent(commandId)}/complete`,
      { method: "POST", body: JSON.stringify(result2) }
    );
  }
  async getUpdate(agentId, version) {
    return this.request(
      `/v1/edge-agents/${encodeURIComponent(agentId)}/updates/next?version=${encodeURIComponent(version)}`,
      { method: "GET" }
    );
  }
  async flushOutbox() {
    if (!this.outbox) return { delivered: 0, pending: 0 };
    return this.outbox.flush(async (queued) => {
      await this.request(queued.path, {
        method: queued.method,
        body: queued.body,
        ...queued.headers ? { headers: queued.headers } : {}
      });
    });
  }
  async requestOrQueue(path, init) {
    try {
      return await this.request(path, init);
    } catch (error) {
      if (!this.outbox || error instanceof GatewayRequestError && error.status < 500) throw error;
      const pending = await this.outbox.enqueue({
        path,
        method: "POST",
        body: String(init.body ?? ""),
        ...init.headers ? { headers: init.headers } : {}
      });
      return { accepted: true, duplicate: false, queued: true, pending };
    }
  }
  async request(path, init, skipAuth = false) {
    const url = new URL(path, this.baseUrl);
    let response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          "content-type": "application/json",
          ...this.developmentUserId ? { "x-user-id": this.developmentUserId } : {},
          ...!skipAuth && this.edgeCredential ? { "x-edge-agent-token": this.edgeCredential } : {},
          ...!skipAuth && !this.edgeCredential && this.edgeBridgeSharedKey ? { "x-edge-bridge-key": this.edgeBridgeSharedKey } : {},
          ...init.headers
        }
      });
    } catch (error) {
      throw new Error(`Cannot reach control plane ${url.origin}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : void 0;
    } catch {
      body = text.slice(0, 1e3);
    }
    if (!response.ok) {
      throw new GatewayRequestError(response.status, `Control plane ${response.status}: ${JSON.stringify(body)}`);
    }
    return body;
  }
};
var GatewayRequestError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};

// src/streaming/rtsp-probe.ts
var import_node_child_process = require("node:child_process");
async function probeRtsp(uri, ffprobePath = "ffprobe", timeoutMs = 1e4) {
  const result2 = await runProcess(ffprobePath, [
    "-v",
    "error",
    "-rtsp_transport",
    "tcp",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,width,height",
    "-of",
    "json",
    uri
  ], timeoutMs);
  if (!result2.ok) {
    return { reachable: false, codec: null, width: null, height: null, error: result2.error };
  }
  try {
    const stream = JSON.parse(result2.stdout).streams?.[0];
    return {
      reachable: Boolean(stream),
      codec: stream?.codec_name ?? null,
      width: stream?.width ?? null,
      height: stream?.height ?? null,
      ...stream ? {} : { error: "No video stream found" }
    };
  } catch {
    return { reachable: false, codec: null, width: null, height: null, error: "Invalid ffprobe output" };
  }
}
async function measureRtspStream(uri, options = {}) {
  const sampleDurationSeconds = Math.max(1, Math.min(10, options.sampleDurationSeconds ?? 3));
  const result2 = await runProcess(options.ffprobePath ?? "ffprobe", [
    "-v",
    "error",
    "-rtsp_transport",
    "tcp",
    "-select_streams",
    "v:0",
    "-read_intervals",
    `%+${sampleDurationSeconds}`,
    "-count_frames",
    "-show_streams",
    "-show_packets",
    "-show_entries",
    "stream=codec_name,width,height,avg_frame_rate,r_frame_rate,nb_read_frames:packet=pts_time,size",
    "-of",
    "json",
    uri
  ], options.timeoutMs ?? Math.max(1e4, sampleDurationSeconds * 3e3));
  if (!result2.ok) {
    return {
      reachable: false,
      codec: null,
      width: null,
      height: null,
      fps: null,
      bitrateKbps: null,
      sampleDurationSeconds: null,
      error: result2.error
    };
  }
  try {
    return parseRtspStreamMetrics(JSON.parse(result2.stdout));
  } catch {
    return {
      reachable: false,
      codec: null,
      width: null,
      height: null,
      fps: null,
      bitrateKbps: null,
      sampleDurationSeconds: null,
      error: "Invalid ffprobe output"
    };
  }
}
function parseRtspStreamMetrics(output) {
  const stream = output.streams?.[0];
  if (!stream) {
    return {
      reachable: false,
      codec: null,
      width: null,
      height: null,
      fps: null,
      bitrateKbps: null,
      sampleDurationSeconds: null,
      error: "No video stream found"
    };
  }
  const packets = output.packets ?? [];
  const timestamps = packets.map((packet) => Number(packet.pts_time)).filter((timestamp) => Number.isFinite(timestamp));
  const firstTimestamp = timestamps.length ? Math.min(...timestamps) : null;
  const lastTimestamp = timestamps.length ? Math.max(...timestamps) : null;
  const sampleDurationSeconds = firstTimestamp !== null && lastTimestamp !== null && lastTimestamp > firstTimestamp ? round(lastTimestamp - firstTimestamp, 3) : null;
  const framesRead = Number(stream.nb_read_frames);
  const advertisedFps = parseFrameRate(stream.avg_frame_rate) ?? parseFrameRate(stream.r_frame_rate);
  const fps = sampleDurationSeconds && Number.isFinite(framesRead) && framesRead > 0 ? round(framesRead / sampleDurationSeconds, 2) : advertisedFps;
  const packetBytes = packets.reduce((total, packet) => {
    const size = Number(packet.size);
    return total + (Number.isFinite(size) && size >= 0 ? size : 0);
  }, 0);
  const bitrateKbps = sampleDurationSeconds && packetBytes > 0 ? Math.round(packetBytes * 8 / (sampleDurationSeconds * 1e3)) : null;
  return {
    reachable: true,
    codec: stream.codec_name ?? null,
    width: stream.width ?? null,
    height: stream.height ?? null,
    fps: fps === null ? null : round(fps, 2),
    bitrateKbps,
    sampleDurationSeconds
  };
}
async function captureRtspLumaFrame(uri, ffmpegPath = "ffmpeg", timeoutMs = 1e4) {
  const result2 = await runProcess(ffmpegPath, [
    "-v",
    "error",
    "-rtsp_transport",
    "tcp",
    "-i",
    uri,
    "-frames:v",
    "1",
    "-vf",
    "scale=64:36,format=gray",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "pipe:1"
  ], timeoutMs);
  return result2.ok && result2.stdoutBuffer.length === 64 * 36 ? result2.stdoutBuffer : null;
}
function parseFrameRate(value) {
  if (!value) return null;
  const parts = value.split("/");
  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0 || numerator <= 0) return null;
  return numerator / denominator;
}
function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
async function runProcess(command, args, timeoutMs) {
  return new Promise((resolve3) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve3(value);
      }
    };
    const child = (0, import_node_child_process.spawn)(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const output = [];
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, stdout: "", stdoutBuffer: Buffer.alloc(0), error: "RTSP probe timed out" });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      output.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish({ ok: false, stdout: "", stdoutBuffer: Buffer.alloc(0), error: redactCredentials(error.message) });
    });
    child.on("close", (code) => {
      const stdoutBuffer = Buffer.concat(output);
      finish({
        ok: code === 0,
        stdout: stdoutBuffer.toString(),
        stdoutBuffer,
        error: redactCredentials(stderr.trim() || `RTSP probe exited with code ${code ?? "unknown"}`)
      });
    });
  });
}
function redactCredentials(value) {
  return value.replace(/(rtsp:\/\/)[^@\s]+@/gi, "$1[redacted]@");
}

// src/streaming/secret-store.ts
var import_node_crypto3 = require("node:crypto");
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");
var import_node_http = require("node:http");
var LocalStreamSecretStore = class {
  constructor(path) {
    this.path = path;
  }
  values = {};
  async load() {
    try {
      this.values = JSON.parse(await (0, import_promises.readFile)(this.path, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  async set(reference, sourceUri) {
    this.values[reference] = sourceUri;
    await (0, import_promises.mkdir)((0, import_node_path.dirname)(this.path), { recursive: true });
    await (0, import_promises.writeFile)(this.path, JSON.stringify(this.values), { encoding: "utf8", mode: 384 });
  }
  get(reference) {
    return this.values[reference];
  }
};
function startSecretProvider(options) {
  const server = (0, import_node_http.createServer)((request, response) => {
    const supplied = request.headers["x-edge-media-key"];
    if (typeof supplied !== "string" || !secureEqual(supplied, options.sharedKey)) {
      response.writeHead(401, { "content-type": "application/json" });
      return response.end('{"error":"invalid_edge_media_identity"}');
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method !== "GET" || url.pathname !== "/v1/secrets/resolve") {
      response.writeHead(404).end();
      return;
    }
    const sourceUri = options.store.get(url.searchParams.get("ref") ?? "");
    if (!sourceUri) {
      response.writeHead(404, { "content-type": "application/json" });
      return response.end('{"error":"stream_secret_unavailable"}');
    }
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ sourceUri }));
  });
  return new Promise((resolve3, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => resolve3(server));
  });
}
function secureEqual(value, expected) {
  const supplied = Buffer.from(value);
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && (0, import_node_crypto3.timingSafeEqual)(supplied, configured);
}

// src/index.ts
var import_node_os2 = require("node:os");

// src/monitoring/internet-probe.ts
var import_node_child_process2 = require("node:child_process");
var import_promises2 = require("node:fs/promises");
var import_node_util = require("node:util");
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process2.execFile);
var NetworkPathTracker = class {
  constructor(windowMs = 5 * 6e4) {
    this.windowMs = windowMs;
  }
  states = /* @__PURE__ */ new Map();
  observe(linkId, input) {
    const sampledAt = input.sampledAt ?? Date.now();
    const state = this.states.get(linkId) ?? {
      samples: [],
      consecutiveFailedPolls: 0,
      lastSuccessfulAt: null,
      outageStartedAt: null,
      publicIp: null,
      previousPublicIp: null,
      publicIpChangedAt: null
    };
    state.samples.push({ sampledAt, attempts: input.attempts, failures: input.failures });
    state.samples = state.samples.filter((sample) => sample.sampledAt >= sampledAt - this.windowMs).slice(-240);
    const pollFailed = input.failures >= input.attempts;
    if (pollFailed) {
      state.consecutiveFailedPolls += 1;
      state.outageStartedAt ??= sampledAt;
    } else {
      state.consecutiveFailedPolls = 0;
      state.lastSuccessfulAt = sampledAt;
      state.outageStartedAt = null;
    }
    const publicIp = normalizePublicIp(input.publicIp);
    if (publicIp && state.publicIp && publicIp !== state.publicIp) {
      state.previousPublicIp = state.publicIp;
      state.publicIpChangedAt = sampledAt;
    }
    if (publicIp) state.publicIp = publicIp;
    this.states.set(linkId, state);
    const attempts = state.samples.reduce((sum, sample) => sum + sample.attempts, 0);
    const failures = state.samples.reduce((sum, sample) => sum + sample.failures, 0);
    const firstSampleAt = state.samples[0]?.sampledAt ?? sampledAt;
    return {
      packetLossPercent: attempts ? round2(failures / attempts * 100) : 100,
      availabilityPercent: attempts ? round2((attempts - failures) / attempts * 100) : 0,
      probeWindowSeconds: round2(Math.max(0, sampledAt - firstSampleAt) / 1e3),
      probeWindowAttempts: attempts,
      consecutiveFailedPolls: state.consecutiveFailedPolls,
      lastSuccessfulAt: iso(state.lastSuccessfulAt),
      outageStartedAt: iso(state.outageStartedAt),
      publicIp: state.publicIp,
      previousPublicIp: state.previousPublicIp,
      publicIpChanged: state.publicIpChangedAt !== null && sampledAt - state.publicIpChangedAt <= this.windowMs,
      publicIpChangedAt: iso(state.publicIpChangedAt)
    };
  }
};
var NetworkCounterSampler = class {
  previous = /* @__PURE__ */ new Map();
  async sample(interfaceName) {
    const key2 = interfaceName ?? "all";
    const current = await readNetworkCounters(interfaceName);
    if (!current) return null;
    const now = Date.now();
    const previous = this.previous.get(key2);
    this.previous.set(key2, { ...current, sampledAt: now });
    if (!previous || now <= previous.sampledAt) return null;
    const seconds = (now - previous.sampledAt) / 1e3;
    return {
      rxMbps: Math.max(0, (current.receivedBytes - previous.receivedBytes) * 8 / seconds / 1e6),
      txMbps: Math.max(0, (current.sentBytes - previous.sentBytes) * 8 / seconds / 1e6)
    };
  }
};
async function probeInternetLink(link, options) {
  const fetcher = options.fetcher ?? fetch;
  const binding = link.sourceAddress ?? link.interfaceName;
  const probeBinding = link.sourceAddress ? "source-address" : link.interfaceName ? "interface" : link.role === "primary" ? "default-route" : "unbound";
  const latencies = [];
  let failures = 0;
  let bindingProbeUnavailable = false;
  let successfulTarget = null;
  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    const target = link.targets[attempt % link.targets.length];
    if (!target) {
      failures += 1;
      continue;
    }
    const started = performance.now();
    try {
      if (binding) {
        await (options.boundProber ?? probeBoundTarget)(target, binding, options.timeoutMs);
      } else {
        await fetcher(target, {
          method: "GET",
          headers: { range: "bytes=0-0", "cache-control": "no-cache" },
          signal: AbortSignal.timeout(options.timeoutMs),
          redirect: "manual"
        });
      }
      latencies.push(performance.now() - started);
      successfulTarget ??= target;
    } catch (error) {
      if (binding && isCommandUnavailable(error)) bindingProbeUnavailable = true;
      failures += 1;
    }
  }
  const routeVerified = probeBinding !== "unbound" && !bindingProbeUnavailable;
  const instantPacketLossPercent = Math.round(failures / options.attempts * 1e4) / 100;
  const latencyMs = latencies.length ? round2(average(latencies)) : null;
  const jitterMs = latencies.length > 1 ? round2(average(latencies.slice(1).map((value, index) => Math.abs(value - latencies[index])))) : 0;
  const counters = await options.counterSampler.sample(link.interfaceName).catch(() => null);
  const downUtilization = counters && link.contractedDownMbps ? counters.rxMbps / link.contractedDownMbps * 100 : null;
  const upUtilization = counters && link.contractedUpMbps ? counters.txMbps / link.contractedUpMbps * 100 : null;
  const utilization = downUtilization === null && upUtilization === null ? null : round2(Math.min(100, Math.max(downUtilization ?? 0, upUtilization ?? 0)));
  const connectivity = latencies.length > 0;
  const gatewayReachable = link.gatewayAddress ? await (options.gatewayProber ?? probeGateway)(
    link.gatewayAddress,
    link.sourceAddress ?? link.interfaceName,
    options.timeoutMs
  ).then(() => true).catch(() => false) : null;
  const publicIp = link.publicIpEndpoint && connectivity ? await (options.publicIpResolver ?? resolvePublicIp)(link.publicIpEndpoint, binding, options.timeoutMs, fetcher).catch(() => null) : null;
  const rolling = (options.pathTracker ?? new NetworkPathTracker()).observe(link.id, {
    attempts: options.attempts,
    failures,
    sampledAt: options.now?.() ?? Date.now(),
    publicIp
  });
  const packetLossPercent = rolling.packetLossPercent;
  const degraded = connectivity && (packetLossPercent >= 2 || (latencyMs ?? 0) >= 150 || (jitterMs ?? 0) >= 30 || (utilization ?? 0) >= 80);
  const reasonCodes = [];
  if (!connectivity) reasonCodes.push("internet_probe_failed");
  if (packetLossPercent >= 2) reasonCodes.push("internet_packet_loss_high");
  if ((latencyMs ?? 0) >= 150) reasonCodes.push("internet_latency_high");
  if ((jitterMs ?? 0) >= 30) reasonCodes.push("internet_jitter_high");
  if ((utilization ?? 0) >= 80) reasonCodes.push("internet_bandwidth_high");
  if (!counters) reasonCodes.push("bandwidth_utilization_unavailable");
  if (!routeVerified) reasonCodes.push("backup_route_binding_not_configured");
  if (bindingProbeUnavailable) reasonCodes.push("link_binding_probe_unavailable");
  if (gatewayReachable === false) reasonCodes.push("isp_gateway_unreachable");
  if (!connectivity && gatewayReachable === true && rolling.consecutiveFailedPolls >= 2) reasonCodes.push("last_mile_outage_suspected");
  if (!link.gatewayAddress) reasonCodes.push("gateway_health_unconfigured");
  if (link.publicIpEndpoint && !rolling.publicIp) reasonCodes.push("public_ip_probe_unavailable");
  if (!link.publicIpEndpoint) reasonCodes.push("public_ip_monitoring_unconfigured");
  if (rolling.publicIpChanged) reasonCodes.push("public_ip_changed");
  const lastMileStatus = gatewayReachable === false ? "gateway_unreachable" : !connectivity && gatewayReachable === true && rolling.consecutiveFailedPolls >= 2 ? "upstream_suspected" : connectivity && gatewayReachable === true ? "healthy" : "unknown";
  return {
    linkId: link.id,
    role: link.role,
    ispName: link.ispName,
    interfaceName: link.interfaceName ?? null,
    connectivity,
    status: !routeVerified ? "unknown" : !connectivity ? "offline" : degraded ? "degraded" : "online",
    latencyMs,
    jitterMs,
    packetLossPercent,
    instantPacketLossPercent,
    availabilityPercent: rolling.availabilityPercent,
    probeWindowSeconds: rolling.probeWindowSeconds,
    probeWindowAttempts: rolling.probeWindowAttempts,
    consecutiveFailedPolls: rolling.consecutiveFailedPolls,
    lastSuccessfulAt: rolling.lastSuccessfulAt,
    outageStartedAt: rolling.outageStartedAt,
    rxMbps: counters ? round2(counters.rxMbps) : null,
    txMbps: counters ? round2(counters.txMbps) : null,
    bandwidthUtilizationPercent: utilization,
    contractedDownMbps: link.contractedDownMbps ?? null,
    contractedUpMbps: link.contractedUpMbps ?? null,
    routeVerified,
    probeBinding,
    probeTarget: successfulTarget,
    gatewayAddress: link.gatewayAddress ?? null,
    gatewayReachable,
    lastMileStatus,
    publicIp: rolling.publicIp,
    previousPublicIp: rolling.previousPublicIp,
    publicIpChanged: rolling.publicIpChanged,
    publicIpChangedAt: rolling.publicIpChangedAt,
    reasonCodes: reasonCodes.length ? reasonCodes : ["internet_link_healthy"]
  };
}
async function probeBoundTarget(target, binding, timeoutMs) {
  await execFileAsync("curl", ["--silent", "--show-error", "--output", process.platform === "win32" ? "NUL" : "/dev/null", "--interface", binding, "--max-time", String(Math.max(1, Math.ceil(timeoutMs / 1e3))), target], {
    timeout: timeoutMs + 1e3,
    windowsHide: true
  });
}
async function probeGateway(address, binding, timeoutMs) {
  const timeoutSeconds = String(Math.max(1, Math.ceil(timeoutMs / 1e3)));
  const args = process.platform === "win32" ? ["-n", "1", "-w", String(timeoutMs), ...binding && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(binding) ? ["-S", binding] : [], address] : ["-c", "1", "-W", timeoutSeconds, ...binding ? ["-I", binding] : [], address];
  await execFileAsync("ping", args, { timeout: timeoutMs + 1e3, windowsHide: true });
}
async function resolvePublicIp(endpoint, binding, timeoutMs, fetcher) {
  let text;
  if (binding) {
    const { stdout } = await execFileAsync("curl", ["--silent", "--show-error", "--interface", binding, "--max-time", String(Math.max(1, Math.ceil(timeoutMs / 1e3))), endpoint], { timeout: timeoutMs + 1e3, windowsHide: true });
    text = stdout;
  } else {
    const response = await fetcher(endpoint, { method: "GET", headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(timeoutMs) });
    text = await response.text();
  }
  try {
    const json = JSON.parse(text);
    return normalizePublicIp(typeof json.ip === "string" ? json.ip : typeof json.address === "string" ? json.address : null);
  } catch {
    return normalizePublicIp(text);
  }
}
function isCommandUnavailable(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
async function readNetworkCounters(interfaceName) {
  if (process.platform === "linux") {
    const text = await (0, import_promises2.readFile)("/proc/net/dev", "utf8");
    const rows = text.split(/\r?\n/).slice(2).flatMap((line) => {
      const [name, values] = line.split(":");
      if (!name || !values || interfaceName && name.trim() !== interfaceName) return [];
      const fields = values.trim().split(/\s+/).map(Number);
      return [{ receivedBytes: fields[0] ?? 0, sentBytes: fields[8] ?? 0 }];
    });
    return rows.length ? rows.reduce((sum, row) => ({ receivedBytes: sum.receivedBytes + row.receivedBytes, sentBytes: sum.sentBytes + row.sentBytes }), { receivedBytes: 0, sentBytes: 0 }) : null;
  }
  if (process.platform === "win32") {
    if (interfaceName) {
      const escapedName = interfaceName.replace(/'/g, "''");
      const { stdout: stdout2 } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Get-NetAdapterStatistics -Name '${escapedName}' | Select-Object -First 1 ReceivedBytes,SentBytes | ConvertTo-Json -Compress`
      ], { timeout: 3e3, windowsHide: true });
      const values = JSON.parse(stdout2);
      const receivedBytes = Number(values.ReceivedBytes);
      const sentBytes = Number(values.SentBytes);
      return Number.isFinite(receivedBytes) && Number.isFinite(sentBytes) ? { receivedBytes, sentBytes } : null;
    }
    const { stdout } = await execFileAsync("netstat", ["-e"], { timeout: 3e3 });
    const match = stdout.match(/Bytes\s+(\d+)\s+(\d+)/i);
    return match ? { receivedBytes: Number(match[1]), sentBytes: Number(match[2]) } : null;
  }
  return null;
}
function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function round2(value) {
  return Math.round(value * 100) / 100;
}
function iso(value) {
  return value === null ? null : new Date(value).toISOString();
}
function normalizePublicIp(value) {
  const candidate = value?.trim();
  return candidate && /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]+)$/i.test(candidate) ? candidate : null;
}

// src/monitoring/edge-resource-probe.ts
var import_node_os = require("node:os");
var import_promises3 = require("node:fs/promises");
var EdgeResourceSampler = class {
  constructor(dependencies = {}) {
    this.dependencies = dependencies;
  }
  previousCpu;
  async sample(diskPath) {
    const cpu = (this.dependencies.cpuSnapshot ?? readCpuSnapshot)();
    const previousCpu = this.previousCpu;
    this.previousCpu = cpu;
    const cpuUsedPercent = previousCpu && cpu.total > previousCpu.total ? round3(100 * (1 - Math.max(0, cpu.idle - previousCpu.idle) / (cpu.total - previousCpu.total))) : null;
    const memory = (this.dependencies.memorySnapshot ?? (() => ({ free: (0, import_node_os.freemem)(), total: (0, import_node_os.totalmem)() })))();
    const memoryUsedPercent = memory.total > 0 ? round3((1 - memory.free / memory.total) * 100) : null;
    let diskUsedPercent = null;
    let diskFreeBytes = null;
    const reasonCodes = [];
    if (cpuUsedPercent === null) reasonCodes.push("cpu_utilization_warming_up");
    if (memoryUsedPercent === null) reasonCodes.push("memory_utilization_unavailable");
    try {
      const disk = await (this.dependencies.diskSnapshot ?? readDiskSnapshot)(diskPath);
      if (disk.blocks > 0 && disk.availableBlocks >= 0 && disk.blockSize > 0) {
        diskUsedPercent = round3(Math.min(100, Math.max(0, (1 - disk.availableBlocks / disk.blocks) * 100)));
        diskFreeBytes = disk.availableBlocks * disk.blockSize;
      } else {
        reasonCodes.push("disk_utilization_unavailable");
      }
    } catch {
      reasonCodes.push("disk_utilization_unavailable");
    }
    return { cpuUsedPercent, memoryUsedPercent, diskUsedPercent, diskFreeBytes, reasonCodes };
  }
};
function readCpuSnapshot() {
  return (0, import_node_os.cpus)().reduce((summary, cpu) => {
    const times = cpu.times;
    const total = times.user + times.nice + times.sys + times.idle + times.irq;
    return { idle: summary.idle + times.idle, total: summary.total + total };
  }, { idle: 0, total: 0 });
}
async function readDiskSnapshot(path) {
  const stats = await (0, import_promises3.statfs)(path);
  return {
    blocks: Number(stats.blocks),
    availableBlocks: Number(stats.bavail),
    blockSize: Number(stats.bsize)
  };
}
function round3(value) {
  return Math.round(value * 100) / 100;
}

// src/monitoring/http-auth.ts
var import_node_crypto4 = require("node:crypto");
async function authenticatedFetch(url, init, credentials, timeoutMs) {
  const headers = new Headers(init.headers);
  const first = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
  const challenge = first.headers.get("www-authenticate");
  if (first.status !== 401 || !credentials || !challenge) return first;
  if (challenge.toLowerCase().startsWith("basic")) {
    await first.body?.cancel();
    headers.set("authorization", `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`);
    return fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
  }
  if (!challenge.toLowerCase().startsWith("digest ")) return first;
  const values = parseDigestChallenge(challenge);
  if (!values.realm || !values.nonce) return first;
  const parsed = new URL(url);
  const uri = `${parsed.pathname}${parsed.search}`;
  const method = (init.method ?? "GET").toUpperCase();
  const cnonce = (0, import_node_crypto4.randomBytes)(8).toString("hex");
  const nc = "00000001";
  const qop = values.qop?.split(",").map((item) => item.trim()).find((item) => item === "auth");
  const ha1 = md5(`${credentials.username}:${values.realm}:${credentials.password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop ? md5(`${ha1}:${values.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${values.nonce}:${ha2}`);
  const parts = [
    `username="${credentials.username}"`,
    `realm="${values.realm}"`,
    `nonce="${values.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
    `algorithm=${values.algorithm ?? "MD5"}`,
    ...values.opaque ? [`opaque="${values.opaque}"`] : [],
    ...qop ? [`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`] : []
  ];
  await first.body?.cancel();
  headers.set("authorization", `Digest ${parts.join(", ")}`);
  return fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
}
function parseDigestChallenge(value) {
  const result2 = {};
  for (const match of value.slice(7).matchAll(/([a-z0-9_-]+)=(?:"([^"]*)"|([^,\s]+))/gi)) result2[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  return result2;
}
function md5(value) {
  return (0, import_node_crypto4.createHash)("md5").update(value).digest("hex");
}

// src/monitoring/recorder-probe.ts
var RECORDING_EVIDENCE_WINDOW_MS = 5 * 6e4;
function looksLikeRecorder(identity, scopes = []) {
  return /(?:^|[\s_-])(dvr|nvr|xvr|uvr|nvs)(?:$|[\s_-])|video recorder|network\s*video\s*storage/i.test(`${identity.manufacturer ?? ""} ${identity.model ?? ""} ${scopes.join(" ")}`);
}
function recorderPlaybackUri(config, sourceChannel, newestPlayableAt) {
  if (!config.username || !config.password) return void 0;
  const newest = new Date(newestPlayableAt);
  if (!Number.isFinite(newest.getTime())) return void 0;
  const end = new Date(newest.getTime() + 5e3);
  const start = new Date(newest.getTime() - 3e4);
  const credentials = `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}`;
  const authority = `${credentials}@${config.host}:${config.rtspPort ?? 554}`;
  if (config.vendor === "hikvision") {
    const track = sourceChannel >= 100 ? sourceChannel : sourceChannel * 100 + 1;
    return `rtsp://${authority}/Streaming/tracks/${track}?starttime=${compactUtc(start)}&endtime=${compactUtc(end)}`;
  }
  if (config.vendor === "dahua" || config.vendor === "cp-plus") {
    return `rtsp://${authority}/cam/playback?channel=${sourceChannel}&subtype=0&starttime=${dahuaPlaybackTime(start)}&endtime=${dahuaPlaybackTime(end)}`;
  }
  return void 0;
}
async function probeRecorder(config, timeoutMs, options = {}) {
  const started = performance.now();
  const base = `${config.secure ? "https" : "http"}://${config.host}:${config.port}`;
  const credentials = config.username ? { username: config.username, password: config.password ?? "" } : void 0;
  try {
    if (config.vendor === "hikvision") return await probeHikvision(config, base, credentials, timeoutMs, started, Boolean(options.includeArchive));
    if (config.vendor === "dahua" || config.vendor === "cp-plus") return await probeDahuaFamily(config, base, credentials, timeoutMs, started, Boolean(options.includeArchive));
    if (config.vendor === "onvif") return await probeOnvif(config, base, credentials, timeoutMs, started, Boolean(options.includeArchive));
    const response = await authenticatedFetch(base, { method: "GET" }, credentials, timeoutMs);
    return result(config, response.status < 500, response.status === 401 ? "degraded" : "online", started, {}, [], response.status === 401 ? ["recorder_credentials_rejected"] : ["generic_http_reachability_only"]);
  } catch (error) {
    return result(config, false, "offline", started, {}, [], [classifyError(error)]);
  }
}
async function probeHikvision(config, base, credentials, timeout, started, includeArchive) {
  const system = await authenticatedFetch(`${base}${config.systemPath ?? "/ISAPI/System/deviceInfo"}`, { method: "GET" }, credentials, timeout);
  if (system.status === 401 || system.status === 403) return result(config, true, "degraded", started, {}, [], ["recorder_credentials_rejected"]);
  if (!system.ok) throw new Error(`hikvision_http_${system.status}`);
  const xml = await system.text();
  const storage = await authenticatedFetch(`${base}${config.storagePath ?? "/ISAPI/ContentMgmt/Storage"}`, { method: "GET" }, credentials, timeout).catch(() => null);
  const storageXml = storage?.ok ? await storage.text() : "";
  const channels = await authenticatedFetch(`${base}/ISAPI/System/Video/inputs/channels`, { method: "GET" }, credentials, timeout).catch(() => null);
  const channelXml = channels?.ok ? await channels.text() : "";
  const channelStatuses = await authenticatedFetch(`${base}/ISAPI/ContentMgmt/InputProxy/channels/status`, { method: "GET" }, credentials, timeout).catch(() => null);
  const channelStatusXml = channelStatuses?.ok ? await channelStatuses.text() : "";
  const channelInventory = hikvisionChannelInventory(channelXml, channelStatusXml);
  const recordingStatus = await getHikvisionRecordingStatus(base, credentials, timeout, channelInventory);
  const archiveEvidence = includeArchive ? await scanHikvisionArchive(config, base, credentials, timeout) : [];
  const total = channelInventory.length || null;
  const connectedStates = channelInventory.map((channel) => channel.connected).filter((value) => value !== null);
  const connected = connectedStates.length === channelInventory.length && channelInventory.length > 0 ? connectedStates.filter(Boolean).length : null;
  const reportedModel = tag(xml, "model");
  return result(config, true, "online", started, {
    model: reportedModel ?? config.model ?? "Unknown",
    // A configured model is useful operational metadata but cannot certify a
    // parser. The compatibility runner requires this to be vendor-system.
    modelSource: reportedModel ? "vendor-system" : "configured",
    serialNumber: tag(xml, "serialNumber") ?? "",
    firmwareVersion: tag(xml, "firmwareVersion") ?? "",
    uptimeSeconds: number(tag(xml, "upTime")),
    totalCameras: total,
    connectedCameras: connected,
    protocol: "hikvision-isapi",
    recordingStatus: recordingStatus.status,
    recordingChannels: recordingStatus.recordingChannels,
    recordingStatusSource: recordingStatus.source,
    lastRecordedAt: recordingStatus.lastRecordedAt
  }, parseHikvisionDisks(storageXml), recordingStatus.reasonCodes, archiveEvidence, recordingStatus.channels);
}
async function getHikvisionRecordingStatus(base, credentials, timeout, channels) {
  try {
    const response = await authenticatedFetch(`${base}/ISAPI/ContentMgmt/search`, {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: hikvisionArchiveSearchBody(channels.map((channel) => channel.trackId))
    }, credentials, timeout);
    if (!response.ok) return recordingUnavailable("hikvision_recording_search_unavailable", channels);
    return parseHikvisionArchiveSearch(await response.text(), channels);
  } catch {
    return recordingUnavailable("hikvision_recording_search_failed", channels);
  }
}
async function probeDahuaFamily(config, base, credentials, timeout, started, includeArchive) {
  const system = await authenticatedFetch(`${base}${config.systemPath ?? "/cgi-bin/magicBox.cgi?action=getSystemInfo"}`, { method: "GET" }, credentials, timeout);
  if (system.status === 401 || system.status === 403) return result(config, true, "degraded", started, {}, [], ["recorder_credentials_rejected"]);
  if (!system.ok) throw new Error(`${config.vendor}_http_${system.status}`);
  const text = await system.text();
  const storage = await authenticatedFetch(`${base}${config.storagePath ?? "/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo"}`, { method: "GET" }, credentials, timeout).catch(() => null);
  const storageText = storage?.ok ? await storage.text() : "";
  const channelResponse = await authenticatedFetch(`${base}/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle`, { method: "GET" }, credentials, timeout).catch(() => null);
  const channelText = channelResponse?.ok ? await channelResponse.text() : "";
  const channelIds = [...new Set([...channelText.matchAll(/ChannelTitle\[(\d+)\]/g)].map((match) => Number(match[1])))].sort((left, right) => left - right);
  const videoLossResponse = await authenticatedFetch(`${base}/cgi-bin/eventManager.cgi?action=getEventIndexes&code=VideoLoss`, { method: "GET" }, credentials, timeout).catch(() => null);
  const videoLossText = videoLossResponse?.ok ? await videoLossResponse.text() : "";
  const disconnectedChannels = videoLossResponse?.ok ? dahuaVideoLossChannels(videoLossText) : null;
  const channelInventory = channelIds.map((sourceChannel) => ({
    sourceChannel,
    connected: disconnectedChannels ? !disconnectedChannels.has(sourceChannel) : null
  }));
  const recordingStatus = await getDahuaRecordingStatus(base, credentials, timeout, channelInventory);
  const archiveEvidence = includeArchive ? await scanDahuaArchive(config, base, credentials, timeout) : [];
  const reportedModel = firstKey(text, ["model", "modelName", "productName", "deviceType"]);
  return result(config, true, "online", started, {
    model: reportedModel ?? config.model ?? "Unknown",
    modelSource: reportedModel ? "vendor-system" : "configured",
    serialNumber: key(text, "serialNumber") ?? "",
    firmwareVersion: firstKey(text, ["softwareVersion", "firmwareVersion", "version"]) ?? "",
    totalCameras: channelIds.length || null,
    connectedCameras: disconnectedChannels ? channelIds.filter((channel) => !disconnectedChannels.has(channel)).length : null,
    protocol: config.vendor === "cp-plus" ? "cp-plus-oem-api" : "dahua-cgi",
    recordingStatus: recordingStatus.status,
    recordingChannels: recordingStatus.recordingChannels,
    recordingStatusSource: recordingStatus.source,
    lastRecordedAt: recordingStatus.lastRecordedAt
  }, parseCgiDisks(storageText), recordingStatus.reasonCodes, archiveEvidence, recordingStatus.channels);
}
async function getDahuaRecordingStatus(base, credentials, timeout, channels) {
  let object;
  try {
    const factory = await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?action=factory.create`, { method: "GET" }, credentials, timeout);
    if (!factory.ok) return recordingUnavailable("dahua_archive_search_unavailable", channels);
    object = key(await factory.text(), "object");
    if (!object) return recordingUnavailable("dahua_archive_search_handle_missing", channels);
    const now = /* @__PURE__ */ new Date();
    const query = new URLSearchParams({
      action: "findFile",
      object,
      "condition.StartTime": dahuaTime(new Date(now.getTime() - RECORDING_EVIDENCE_WINDOW_MS)),
      "condition.EndTime": dahuaTime(now),
      "condition.Types[0]": "dav"
    });
    const find = await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?${query}`, { method: "GET" }, credentials, timeout);
    if (!find.ok) return recordingUnavailable("dahua_archive_search_failed", channels);
    const matches = [];
    for (let page = 0; page < 40; page++) {
      const next = await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?${new URLSearchParams({ action: "findNextFile", object, count: "128" })}`, { method: "GET" }, credentials, timeout);
      if (!next.ok) return recordingUnavailable("dahua_archive_results_unavailable", channels);
      const text = await next.text();
      const found = key(text, "found");
      if (!dahuaFoundResults(found)) return recordingProbeFromMatches(matches, channels, "dahua_no_recent_recording_evidence");
      const parsed = parseDahuaRecordingMatches(text);
      if (!parsed.length) return recordingUnavailable("dahua_archive_results_unparseable", channels);
      matches.push(...parsed);
    }
    return recordingUnavailable("dahua_archive_recent_result_limit", channels);
  } catch {
    return recordingUnavailable("dahua_archive_search_failed", channels);
  } finally {
    if (object) {
      await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?${new URLSearchParams({ action: "close", object })}`, { method: "GET" }, credentials, timeout).catch(() => void 0);
    }
  }
}
async function scanHikvisionArchive(config, base, credentials, timeout) {
  const retention = config.archiveRetention;
  if (!retention) return [];
  const searchStartedAt = /* @__PURE__ */ new Date();
  const searchFrom = new Date(searchStartedAt.getTime() - retention.lookbackDays * 864e5);
  return mapArchiveChannels(retention.channels, async (mapping) => {
    try {
      const result2 = await searchHikvisionArchive(base, credentials, timeout, hikvisionTrackId(mapping.channel), searchFrom, searchStartedAt, retention.maxResults);
      return archiveEvidenceFromSearch(mapping, result2, retention, searchFrom, searchStartedAt);
    } catch {
      return unavailableArchiveEvidence(mapping, retention, searchFrom, searchStartedAt, "hikvision_archive_retention_search_failed");
    }
  });
}
async function searchHikvisionArchive(base, credentials, timeout, trackId, from, to, maxResults) {
  const pageSize = Math.min(1e3, maxResults);
  const segments = [];
  for (let position = 0; segments.length < maxResults; position += pageSize) {
    const response = await authenticatedFetch(`${base}/ISAPI/ContentMgmt/search`, {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body: hikvisionArchiveSearchBody([String(trackId)], from, to, pageSize, position)
    }, credentials, timeout);
    if (!response.ok) throw new Error(`hikvision_archive_${response.status}`);
    const xml = await response.text();
    const page = parseHikvisionArchiveSegments(xml);
    if (page.length === 0) return { segments, coverageComplete: true, reasonCodes: [] };
    segments.push(...page);
    const declared = firstFinite(valuesForTag(xml, "numOfMatches").concat(valuesForTag(xml, "totalMatches")).map(Number));
    if (declared !== null && segments.length >= declared || page.length < pageSize) {
      return { segments, coverageComplete: true, reasonCodes: [] };
    }
  }
  return { segments, coverageComplete: false, reasonCodes: ["hikvision_archive_retention_result_limit"] };
}
async function scanDahuaArchive(config, base, credentials, timeout) {
  const retention = config.archiveRetention;
  if (!retention) return [];
  const searchStartedAt = /* @__PURE__ */ new Date();
  const searchFrom = new Date(searchStartedAt.getTime() - retention.lookbackDays * 864e5);
  return mapArchiveChannels(retention.channels, async (mapping) => {
    try {
      const result2 = await searchDahuaArchive(base, credentials, timeout, mapping.channel, searchFrom, searchStartedAt, retention.maxResults);
      return archiveEvidenceFromSearch(mapping, result2, retention, searchFrom, searchStartedAt);
    } catch {
      return unavailableArchiveEvidence(mapping, retention, searchFrom, searchStartedAt, "dahua_archive_retention_search_failed");
    }
  });
}
async function searchDahuaArchive(base, credentials, timeout, channel, from, to, maxResults) {
  let object;
  const segments = [];
  try {
    const factory = await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?action=factory.create`, { method: "GET" }, credentials, timeout);
    if (!factory.ok) throw new Error(`dahua_archive_factory_${factory.status}`);
    object = key(await factory.text(), "object");
    if (!object) throw new Error("dahua_archive_handle_missing");
    const query = new URLSearchParams({
      action: "findFile",
      object,
      "condition.Channel": String(channel),
      "condition.StartTime": dahuaTime(from),
      "condition.EndTime": dahuaTime(to),
      "condition.Types[0]": "dav"
    });
    const find = await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?${query}`, { method: "GET" }, credentials, timeout);
    if (!find.ok) throw new Error(`dahua_archive_find_${find.status}`);
    const pageSize = Math.min(1e3, maxResults);
    while (segments.length < maxResults) {
      const next = await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?${new URLSearchParams({ action: "findNextFile", object, count: String(pageSize) })}`, { method: "GET" }, credentials, timeout);
      if (!next.ok) throw new Error(`dahua_archive_next_${next.status}`);
      const text = await next.text();
      const found = key(text, "found");
      const page = parseDahuaArchiveSegments(text);
      if (!dahuaFoundResults(found)) return { segments, coverageComplete: true, reasonCodes: [] };
      if (page.length === 0) return { segments, coverageComplete: false, reasonCodes: ["dahua_archive_retention_unparseable"] };
      segments.push(...page);
    }
    return { segments, coverageComplete: false, reasonCodes: ["dahua_archive_retention_result_limit"] };
  } finally {
    if (object) {
      await authenticatedFetch(`${base}/cgi-bin/mediaFileFind.cgi?${new URLSearchParams({ action: "close", object })}`, { method: "GET" }, credentials, timeout).catch(() => void 0);
    }
  }
}
function archiveEvidenceFromSearch(mapping, result2, retention, searchFrom, searchTo) {
  if (!result2.coverageComplete) {
    return {
      cameraId: mapping.cameraId,
      sourceChannel: mapping.channel,
      status: "unavailable",
      oldestContinuousAt: null,
      newestPlayableAt: null,
      retentionLowerBound: false,
      coverageComplete: false,
      continuityGapSeconds: retention.continuityGapSeconds,
      gapCount: 0,
      largestGapSeconds: 0,
      searchStartedAt: searchTo.toISOString(),
      reasonCodes: result2.reasonCodes
    };
  }
  if (result2.segments.length === 0) {
    return {
      cameraId: mapping.cameraId,
      sourceChannel: mapping.channel,
      status: "empty",
      oldestContinuousAt: null,
      newestPlayableAt: null,
      retentionLowerBound: false,
      coverageComplete: true,
      continuityGapSeconds: retention.continuityGapSeconds,
      gapCount: 0,
      largestGapSeconds: 0,
      searchStartedAt: searchTo.toISOString(),
      reasonCodes: ["recorder_archive_empty"]
    };
  }
  const continuous = continuousArchiveWindow(result2.segments, retention.continuityGapSeconds);
  const gaps = archiveGapSummary(result2.segments, retention.continuityGapSeconds);
  return {
    cameraId: mapping.cameraId,
    sourceChannel: mapping.channel,
    status: "available",
    oldestContinuousAt: new Date(continuous.oldest).toISOString(),
    newestPlayableAt: new Date(continuous.newest).toISOString(),
    retentionLowerBound: continuous.oldest <= searchFrom.getTime() + Math.max(1e3, retention.continuityGapSeconds * 1e3),
    coverageComplete: true,
    continuityGapSeconds: retention.continuityGapSeconds,
    gapCount: gaps.count,
    largestGapSeconds: gaps.largestGapSeconds,
    searchStartedAt: searchTo.toISOString(),
    reasonCodes: gaps.count ? ["recorder_archive_gaps_detected"] : []
  };
}
function unavailableArchiveEvidence(mapping, retention, searchFrom, searchTo, reasonCode) {
  return {
    cameraId: mapping.cameraId,
    sourceChannel: mapping.channel,
    status: "unavailable",
    oldestContinuousAt: null,
    newestPlayableAt: null,
    retentionLowerBound: false,
    coverageComplete: false,
    continuityGapSeconds: retention.continuityGapSeconds,
    gapCount: 0,
    largestGapSeconds: 0,
    searchStartedAt: searchTo.toISOString(),
    reasonCodes: [reasonCode]
  };
}
function unsupportedArchiveEvidence(config, reasonCode) {
  const retention = config.archiveRetention;
  if (!retention) return [];
  const now = /* @__PURE__ */ new Date();
  const searchFrom = new Date(now.getTime() - retention.lookbackDays * 864e5);
  return retention.channels.map((mapping) => unavailableArchiveEvidence(mapping, retention, searchFrom, now, reasonCode));
}
function continuousArchiveWindow(segments, gapSeconds) {
  const ordered = segments.filter((segment) => Number.isFinite(segment.startedAt) && Number.isFinite(segment.endedAt) && segment.endedAt >= segment.startedAt).sort((left, right) => right.endedAt - left.endedAt);
  const newest = ordered[0].endedAt;
  let oldest = ordered[0].startedAt;
  let cursor = oldest;
  for (const segment of ordered.slice(1)) {
    if (cursor - segment.endedAt > gapSeconds * 1e3) break;
    oldest = Math.min(oldest, segment.startedAt);
    cursor = oldest;
  }
  return { oldest, newest };
}
function archiveGapSummary(segments, toleranceSeconds) {
  const ordered = segments.filter((segment) => Number.isFinite(segment.startedAt) && Number.isFinite(segment.endedAt) && segment.endedAt >= segment.startedAt).sort((left, right) => left.startedAt - right.startedAt);
  let cursor = ordered[0]?.endedAt;
  let count = 0;
  let largestGapSeconds = 0;
  for (const segment of ordered.slice(1)) {
    if (cursor === void 0) break;
    const gapSeconds = Math.max(0, (segment.startedAt - cursor) / 1e3);
    if (gapSeconds > toleranceSeconds) {
      count++;
      largestGapSeconds = Math.max(largestGapSeconds, gapSeconds);
    }
    cursor = Math.max(cursor, segment.endedAt);
  }
  return { count, largestGapSeconds: Math.round(largestGapSeconds * 100) / 100 };
}
async function mapArchiveChannels(channels, mapper) {
  const results = [];
  const pending = [...channels];
  const workers = Array.from({ length: Math.min(4, channels.length) }, async () => {
    while (pending.length) {
      const channel = pending.shift();
      if (channel) results.push(await mapper(channel));
    }
  });
  await Promise.all(workers);
  return results;
}
function parseHikvisionArchiveSegments(xml) {
  const items = [...xml.matchAll(/<(?:[^:>]+:)?(?:searchMatchItem|matchItem)\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?(?:searchMatchItem|matchItem)>/gi)];
  return items.flatMap((item) => {
    const startedAt = Date.parse(valuesForTag(item[1], "startTime")[0] ?? "");
    const endedAt = Date.parse(valuesForTag(item[1], "endTime")[0] ?? "");
    const trackId = Number(valuesForTag(item[1], "trackID")[0] ?? "");
    return Number.isFinite(startedAt) && Number.isFinite(endedAt) ? [{ startedAt, endedAt, sourceChannel: hikvisionSourceChannel(trackId) }] : [];
  });
}
function parseDahuaArchiveSegments(text) {
  const grouped = /* @__PURE__ */ new Map();
  for (const match of text.matchAll(/(?:items|item)\[(\d+)\]\.(StartTime|EndTime|Channel)=([^\r\n]+)/gi)) {
    const item = grouped.get(match[1]) ?? {};
    if (match[2].toLowerCase() === "starttime") item.startedAt = match[3].trim();
    else if (match[2].toLowerCase() === "endtime") item.endedAt = match[3].trim();
    else item.sourceChannel = match[3].trim();
    grouped.set(match[1], item);
  }
  return [...grouped.values()].flatMap((item) => {
    const startedAt = parseDahuaTimestamp(item.startedAt);
    const endedAt = parseDahuaTimestamp(item.endedAt);
    const sourceChannel = Number(item.sourceChannel);
    return startedAt !== null && endedAt !== null ? [{ startedAt, endedAt, sourceChannel: Number.isInteger(sourceChannel) ? sourceChannel : null }] : [];
  });
}
function parseDahuaTimestamp(value) {
  const parsed = value ? Date.parse(value.replace(" ", "T")) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
function firstFinite(values) {
  return values.find((value) => Number.isFinite(value)) ?? null;
}
async function probeOnvif(config, base, credentials, timeout, started, includeArchive) {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>`;
  const response = await authenticatedFetch(`${base}${config.systemPath ?? "/onvif/device_service"}`, { method: "POST", headers: { "content-type": "application/soap+xml" }, body }, credentials, timeout);
  if (response.status === 401 || response.status === 403) return result(config, true, "degraded", started, {}, [], ["recorder_credentials_rejected"]);
  if (!response.ok) throw new Error(`onvif_http_${response.status}`);
  const xml = await response.text();
  const recordingStatus = await getOnvifRecordingStatus(base, config.systemPath ?? "/onvif/device_service", credentials, timeout);
  const archiveEvidence = includeArchive ? unsupportedArchiveEvidence(config, "onvif_archive_continuity_unsupported") : [];
  const reportedModel = tag(xml, "Model");
  return result(config, true, "online", started, {
    model: reportedModel ?? config.model ?? "Unknown",
    modelSource: reportedModel ? "vendor-system" : "configured",
    serialNumber: tag(xml, "SerialNumber") ?? "",
    firmwareVersion: tag(xml, "FirmwareVersion") ?? "",
    protocol: "onvif",
    recordingStatus: recordingStatus.status,
    recordingChannels: recordingStatus.recordingChannels,
    recordingStatusSource: recordingStatus.source,
    lastRecordedAt: recordingStatus.lastRecordedAt,
    totalCameras: null,
    connectedCameras: null
  }, [], recordingStatus.reasonCodes, archiveEvidence, recordingStatus.channels);
}
async function getOnvifRecordingStatus(base, deviceServicePath, credentials, timeout) {
  try {
    const searchEndpoint = await getOnvifSearchEndpoint(base, deviceServicePath, credentials, timeout);
    const summary = await onvifRecordingSummary(searchEndpoint ? [searchEndpoint] : onvifSearchFallbackEndpoints(base), credentials, timeout);
    if (!summary) return recordingUnavailable("onvif_recording_search_unavailable");
    const lastRecordedAt = newestOnvifRecordingData(summary);
    if (hasRecentOnvifRecordingData(summary)) return { status: "recording", recordingChannels: null, lastRecordedAt, channels: [], reasonCodes: [], source: "recording-summary" };
    return { status: "stopped", recordingChannels: null, lastRecordedAt, channels: [], reasonCodes: ["onvif_no_recent_recording_evidence"], source: "recording-summary" };
  } catch {
    return recordingUnavailable("onvif_recording_probe_failed");
  }
}
function recordingUnavailable(reasonCode, inventory = []) {
  return {
    status: "unknown",
    recordingChannels: null,
    lastRecordedAt: null,
    channels: inventory.map((channel) => ({
      sourceChannel: channel.sourceChannel,
      status: "unknown",
      connected: channel.connected,
      lastRecordedAt: null,
      recordingStatusSource: "unavailable",
      reasonCodes: [reasonCode]
    })),
    reasonCodes: [reasonCode],
    source: "unavailable"
  };
}
function hikvisionArchiveSearchBody(trackIds, start = new Date(Date.now() - RECORDING_EVIDENCE_WINDOW_MS), end = /* @__PURE__ */ new Date(), maxResults = 128, searchResultPosition = 0) {
  const tracks = (trackIds.length ? trackIds : ["101"]).map((id) => `<trackID>${id}</trackID>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><CMSearchDescription version="1.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><searchID>sentinel-recorder-health</searchID><trackList>${tracks}</trackList><timeSpanList><timeSpan><startTime>${start.toISOString()}</startTime><endTime>${end.toISOString()}</endTime></timeSpan></timeSpanList><maxResults>${maxResults}</maxResults><searchResultPosition>${searchResultPosition}</searchResultPosition></CMSearchDescription>`;
}
function parseHikvisionArchiveSearch(xml, inventory) {
  const items = [...xml.matchAll(/<(?:[^:>]+:)?(?:searchMatchItem|matchItem)\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?(?:searchMatchItem|matchItem)>/gi)];
  const matches = items.map((item) => {
    const trackId = Number(valuesForTag(item[1], "trackID")[0] ?? valuesForTag(item[1], "channelID")[0] ?? "");
    const endedAt = Date.parse(valuesForTag(item[1], "endTime")[0] ?? "");
    return {
      sourceChannel: hikvisionSourceChannel(trackId),
      lastRecordedAt: Number.isFinite(endedAt) ? endedAt : null
    };
  });
  return recordingProbeFromMatches(matches, inventory, "hikvision_no_recent_recording_evidence");
}
function parseDahuaRecordingMatches(text) {
  const grouped = /* @__PURE__ */ new Map();
  for (const match of text.matchAll(/(?:items|item)\[(\d+)\]\.(Channel|EndTime)=([^\r\n]+)/gi)) {
    const item = grouped.get(match[1]) ?? {};
    if (match[2].toLowerCase() === "channel") item.sourceChannel = Number(match[3].trim());
    else {
      const endedAt = parseDahuaTimestamp(match[3].trim());
      if (endedAt !== null) item.endedAt = endedAt;
    }
    grouped.set(match[1], item);
  }
  return [...grouped.values()].flatMap((item) => Number.isInteger(item.sourceChannel) ? [{ sourceChannel: item.sourceChannel, lastRecordedAt: item.endedAt ?? null }] : []);
}
function recordingProbeFromMatches(matches, inventory, stoppedReason) {
  const newestByChannel = /* @__PURE__ */ new Map();
  for (const match of matches) {
    if (match.sourceChannel === null) continue;
    const current = newestByChannel.get(match.sourceChannel);
    if (current === void 0 || match.lastRecordedAt !== null && (current === null || match.lastRecordedAt > current)) {
      newestByChannel.set(match.sourceChannel, match.lastRecordedAt);
    }
  }
  const effectiveInventory = inventory.length ? inventory : [...newestByChannel.keys()].sort((left, right) => left - right).map((sourceChannel) => ({ sourceChannel, connected: null }));
  const channels = effectiveInventory.map((channel) => {
    const hasMedia = newestByChannel.has(channel.sourceChannel);
    const timestamp = newestByChannel.get(channel.sourceChannel) ?? null;
    return {
      sourceChannel: channel.sourceChannel,
      status: hasMedia ? "recording" : "stopped",
      connected: channel.connected,
      lastRecordedAt: timestamp === null ? null : new Date(timestamp).toISOString(),
      recordingStatusSource: "recent-media-search",
      reasonCodes: hasMedia ? [] : [stoppedReason]
    };
  });
  const recordingChannels = channels.filter((channel) => channel.status === "recording").length || (matches.length && !channels.length ? new Set(matches.map((match) => match.sourceChannel).filter((value) => value !== null)).size : 0);
  const lastRecorded = matches.map((match) => match.lastRecordedAt).filter((value) => value !== null && Number.isFinite(value));
  const lastRecordedAt = lastRecorded.length ? new Date(Math.max(...lastRecorded)).toISOString() : null;
  const total = effectiveInventory.length;
  const aggregateOnlyMatch = matches.length > 0 && total === 0 && recordingChannels === 0;
  const status = aggregateOnlyMatch ? "recording" : recordingChannels === 0 ? "stopped" : total > 0 && recordingChannels < total ? "partial" : "recording";
  const reasonCodes = status === "stopped" ? [stoppedReason] : status === "partial" ? ["some_channels_not_recording"] : [];
  return { status, recordingChannels: aggregateOnlyMatch ? null : recordingChannels, lastRecordedAt, channels, reasonCodes, source: "recent-media-search" };
}
function dahuaTime(value) {
  return value.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}
async function getOnvifSearchEndpoint(base, deviceServicePath, credentials, timeout) {
  try {
    const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetCapabilities xmlns="http://www.onvif.org/ver10/device/wsdl"><Category>All</Category></GetCapabilities></s:Body></s:Envelope>`;
    const response = await authenticatedFetch(`${base}${deviceServicePath}`, { method: "POST", headers: { "content-type": "application/soap+xml" }, body }, credentials, timeout);
    if (!response.ok) return null;
    const search = (await response.text()).match(/<(?:[^:>]+:)?Search\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?Search>/i)?.[1];
    const xAddr = search ? tag(search, "XAddr") : void 0;
    return xAddr && /^https?:\/\//i.test(xAddr) ? xAddr : null;
  } catch {
    return null;
  }
}
function onvifSearchFallbackEndpoints(base) {
  return [`${base}/onvif/search_service`, `${base}/onvif/recording_search_service`, `${base}/onvif/Search`];
}
async function onvifRecordingSummary(endpoints, credentials, timeout) {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetRecordingSummary xmlns="http://www.onvif.org/ver10/search/wsdl"/></s:Body></s:Envelope>`;
  for (const endpoint of endpoints) {
    try {
      const response = await authenticatedFetch(endpoint, { method: "POST", headers: { "content-type": "application/soap+xml" }, body }, credentials, timeout);
      if (response.ok) return response.text();
    } catch {
    }
  }
  return null;
}
function hasRecentOnvifRecordingData(xml) {
  const numberRecordings = Number(valuesForTag(xml, "NumberRecordings")[0] ?? "");
  if (Number.isFinite(numberRecordings) && numberRecordings === 0) return false;
  const dataUntil = valuesForTag(xml, "DataUntil").map((value) => Date.parse(value)).filter(Number.isFinite);
  return dataUntil.some((value) => value >= Date.now() - RECORDING_EVIDENCE_WINDOW_MS);
}
function newestOnvifRecordingData(xml) {
  const dataUntil = valuesForTag(xml, "DataUntil").map((value) => Date.parse(value)).filter(Number.isFinite);
  return dataUntil.length ? new Date(Math.max(...dataUntil)).toISOString() : null;
}
function valuesForTag(xml, name) {
  return [...xml.matchAll(new RegExp(`<(?:(?:[^:>]+):)?${name}>([^<]+)<\\/(?:(?:[^:>]+):)?${name}>`, "gi"))].map((match) => match[1].trim());
}
function hikvisionChannelInventory(channelXml, statusXml) {
  const channelBlocks = [...channelXml.matchAll(/<(?:[^:>]+:)?VideoInputChannel\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?VideoInputChannel>/gi)];
  const ids = channelBlocks.map((block, index) => Number(valuesForTag(block[1], "id")[0] ?? index + 1)).filter((id) => Number.isInteger(id) && id > 0);
  const statusByChannel = /* @__PURE__ */ new Map();
  for (const match of statusXml.matchAll(/<(?:[^:>]+:)?InputProxyChannelStatus\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?InputProxyChannelStatus>/gi)) {
    const id = Number(valuesForTag(match[1], "id")[0] ?? "");
    const online = valuesForTag(match[1], "online")[0]?.toLowerCase();
    if (Number.isInteger(id) && (online === "true" || online === "false")) statusByChannel.set(id, online === "true");
  }
  return ids.map((sourceChannel) => ({
    sourceChannel,
    trackId: hikvisionTrackId(sourceChannel),
    connected: statusByChannel.get(sourceChannel) ?? null
  }));
}
function hikvisionTrackId(sourceChannel) {
  return String(sourceChannel >= 100 ? sourceChannel : sourceChannel * 100 + 1);
}
function hikvisionSourceChannel(trackId) {
  return Number.isInteger(trackId) && trackId > 0 ? trackId >= 100 ? Math.floor(trackId / 100) : trackId : null;
}
function dahuaVideoLossChannels(text) {
  const channels = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(/(?:result|index(?:es)?)\s*=\s*([^\r\n]*)/gi)) {
    for (const value of match[1].match(/\d+/g) ?? []) channels.add(Number(value));
  }
  for (const match of text.matchAll(/(?:channels?|index(?:es)?)\[(\d+)\]\s*=\s*(?:true|1)/gi)) channels.add(Number(match[1]));
  return channels;
}
function dahuaFoundResults(value) {
  if (!value) return false;
  if (value.toLowerCase() === "true") return true;
  const count = Number(value);
  return Number.isFinite(count) && count > 0;
}
function result(config, reachable, status, started, extra, hddStatus, reasonCodes, archiveEvidence = [], channelHealth = []) {
  return { metrics: { name: config.name, deviceType: config.deviceType, vendor: config.vendor, model: config.model ?? "Unknown", modelSource: "configured", ipAddress: config.host, reachable, status, latencyMs: Math.round((performance.now() - started) * 100) / 100, ...extra }, hddStatus, reasonCodes, archiveEvidence, channelHealth };
}
function parseHikvisionDisks(xml) {
  const raidStatus = firstTag(xml, ["raidStatus", "arrayStatus", "raidState"]);
  const raidLevel = firstTag(xml, ["raidLevel", "arrayLevel"]);
  return [...xml.matchAll(/<hdd>([\s\S]*?)<\/hdd>/gi)].map((match, index) => {
    const body = match[1];
    return {
      diskNo: tag(body, "id") ?? index + 1,
      devicePath: tag(body, "name") ?? `HDD ${index + 1}`,
      serialNumber: firstTag(body, ["serialNumber", "serialNo", "sn"]),
      model: firstTag(body, ["model", "modelName"]),
      capacity: tag(body, "capacity"),
      freeSpace: tag(body, "freeSpace"),
      state: tag(body, "status"),
      temperature: tag(body, "temperature"),
      smartStatus: firstTag(body, ["smartStatus", "smartHealth"]),
      reallocatedSectors: tag(body, "reallocatedSectors"),
      pendingSectors: tag(body, "pendingSectors"),
      uncorrectableSectors: tag(body, "uncorrectableSectors"),
      raidStatus: firstTag(body, ["raidStatus", "arrayStatus"]) ?? raidStatus,
      raidLevel: firstTag(body, ["raidLevel", "arrayLevel"]) ?? raidLevel,
      writeVerification: firstTag(body, ["writeVerification", "writeStatus", "recordingWriteStatus"]),
      writeVerifiedAt: firstTag(body, ["writeVerifiedAt", "lastWriteTime"])
    };
  });
}
function parseCgiDisks(text) {
  const grouped = /* @__PURE__ */ new Map();
  const sharedRaidStatus = firstKey(text, ["Raid.Status", "RAID.State", "Storage.RaidStatus"]);
  const sharedRaidLevel = firstKey(text, ["Raid.Level", "RAID.Level", "Storage.RaidLevel"]);
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/(?:Storage|Disk|HDD)(?:\[|\.)(\d+)\]?\.([^=]+)=(.*)$/i);
    if (!match) continue;
    const item = grouped.get(match[1]) ?? { diskNo: Number(match[1]) + 1 };
    item[match[2]] = match[3].trim();
    grouped.set(match[1], item);
  }
  return [...grouped.values()].map((item) => ({ ...item, raidStatus: item.raidStatus ?? sharedRaidStatus, raidLevel: item.raidLevel ?? sharedRaidLevel }));
}
function tag(xml, name) {
  return xml.match(new RegExp(`<(?:[^:>]+:)?${name}>([^<]+)<\\/(?:[^:>]+:)?${name}>`, "i"))?.[1];
}
function firstTag(xml, names) {
  return names.map((name) => tag(xml, name)).find((value) => Boolean(value));
}
function key(text, name) {
  return text.match(new RegExp(`(?:^|\\n)${name}=([^\\r\\n]+)`, "i"))?.[1]?.trim();
}
function firstKey(text, names) {
  return names.map((name) => key(text, name)).find((value) => Boolean(value));
}
function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function classifyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|abort/i.test(message) ? "recorder_probe_timeout" : "recorder_unreachable";
}
function compactUtc(value) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function dahuaPlaybackTime(value) {
  return value.toISOString().replace(/[-:]/g, "_").replace("T", "_").replace(/\.\d{3}Z$/, "");
}

// src/monitoring/camera-heartbeat.ts
var import_node_crypto5 = require("node:crypto");

// src/monitoring/camera-packet-loss.ts
var import_node_child_process3 = require("node:child_process");
async function measureCameraPacketLoss(streamUri, attempts = 3, timeoutMs = 1e3) {
  let host;
  try {
    host = new URL(streamUri).hostname;
  } catch {
    return null;
  }
  if (!host) return null;
  const safeAttempts = Math.max(1, Math.min(10, attempts));
  const args = process.platform === "win32" ? ["-n", String(safeAttempts), "-w", String(timeoutMs), host] : ["-c", String(safeAttempts), "-W", String(Math.max(1, Math.ceil(timeoutMs / 1e3))), host];
  return new Promise((resolve3) => {
    const child = (0, import_node_child_process3.spawn)("ping", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timeout = setTimeout(() => {
      child.kill();
      resolve3(null);
    }, safeAttempts * timeoutMs + 2e3);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", () => {
      clearTimeout(timeout);
      resolve3(null);
    });
    child.on("close", () => {
      clearTimeout(timeout);
      resolve3(parseIcmpPacketLoss(output));
    });
  });
}
function parseIcmpPacketLoss(output) {
  const windows = output.match(/\(([\d.,]+)%\s*loss\)/i);
  const posix = output.match(/([\d.,]+)%\s*packet\s*loss/i);
  const value = windows?.[1] ?? posix?.[1];
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

// src/utils/logger.ts
var import_node_fs = require("node:fs");
var import_node_path2 = require("node:path");
function write(level, message, context) {
  const payload = context ? ` ${JSON.stringify(context)}` : "";
  const line = `${(/* @__PURE__ */ new Date()).toISOString()} [edge-agent] [${level}] ${message}${payload}`;
  writeFileLine(line);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.info(line);
}
function writeFileLine(line) {
  try {
    const configured = process.env.EDGE_LOG_PATH || "./logs/edge-agent.log";
    const path = (0, import_node_path2.resolve)(configured);
    (0, import_node_fs.mkdirSync)((0, import_node_path2.dirname)(path), { recursive: true });
    if ((0, import_node_fs.existsSync)(path) && (0, import_node_fs.statSync)(path).size > 10 * 1024 * 1024) {
      const rotated = `${path}.1`;
      try {
        (0, import_node_fs.renameSync)(path, rotated);
      } catch {
      }
    }
    (0, import_node_fs.appendFileSync)(path, `${line}
`, "utf8");
  } catch {
  }
}
var logger = {
  debug: (message, context) => write("debug", message, context),
  info: (message, context) => write("info", message, context),
  warn: (message, context) => write("warn", message, context),
  error: (message, context) => write("error", message, context)
};

// src/monitoring/camera-heartbeat.ts
function assessLumaFrame(previous, frame) {
  const brightness = frame.reduce((sum, value) => sum + value, 0) / frame.length;
  const hash = (0, import_node_crypto5.createHash)("sha256").update(frame).digest("hex");
  const identicalSamples = previous?.hash === hash ? previous.identicalSamples + 1 : 1;
  return {
    state: { hash, identicalSamples },
    // Three successive identical 64x36 luminance samples avoids flagging a
    // single still image as a frozen stream.
    imageFrozen: identicalSamples >= 3,
    blackScreen: brightness <= 10,
    brightness: Math.round(brightness * 10) / 10
  };
}
var CameraHeartbeatService = class {
  constructor(apiEndpoint, branchId, edgeAgentId, developmentUserId, ffprobePath = "ffprobe", ffmpegPath = "ffmpeg", edgeAuthCredential, telemetrySender) {
    this.apiEndpoint = apiEndpoint;
    this.branchId = branchId;
    this.edgeAgentId = edgeAgentId;
    this.developmentUserId = developmentUserId;
    this.ffprobePath = ffprobePath;
    this.ffmpegPath = ffmpegPath;
    this.edgeAuthCredential = edgeAuthCredential;
    this.telemetrySender = telemetrySender;
  }
  cameras = /* @__PURE__ */ new Map();
  frameStates = /* @__PURE__ */ new Map();
  heartbeatInterval = null;
  isRunning = false;
  replaceCameras(cameras) {
    const retainedIds = new Set(cameras.map((camera) => camera.id));
    this.cameras.clear();
    for (const camera of cameras) this.cameras.set(camera.id, camera);
    for (const cameraId of this.frameStates.keys()) {
      if (!retainedIds.has(cameraId)) this.frameStates.delete(cameraId);
    }
    logger.info(`Synchronized ${cameras.length} camera(s) for heartbeat monitoring`);
  }
  start(intervalMs = 3e4) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.sendAllHeartbeats().catch((error) => logger.error("Failed to send initial camera heartbeats", { error }));
    this.heartbeatInterval = setInterval(() => {
      this.sendAllHeartbeats().catch((error) => logger.error("Failed to send camera heartbeats", { error }));
    }, intervalMs);
  }
  stop() {
    this.isRunning = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }
  async sendAllHeartbeats() {
    const cameras = [...this.cameras.values()].filter((camera) => camera.enabled);
    const batchSize = 5;
    for (let index = 0; index < cameras.length; index += batchSize) {
      await Promise.allSettled(cameras.slice(index, index + batchSize).map((camera) => this.sendHeartbeat(camera)));
    }
  }
  async sendHeartbeat(camera) {
    const startedAt = Date.now();
    try {
      const data = camera.rtspUrl ? await this.measureCamera(camera, startedAt) : {
        cameraId: camera.id,
        status: "unknown",
        responseTimeMs: Date.now() - startedAt,
        streamActive: false,
        videoLoss: false,
        reasonCodes: ["stream_secret_unavailable"],
        quality: "unavailable",
        errorMessage: "Local RTSP secret is unavailable"
      };
      await this.sendToPlatform(camera.id, data);
      logger.debug(`Heartbeat sent for camera ${camera.name}: ${data.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Failed to send heartbeat for camera ${camera.name}`, { error });
      await this.sendToPlatform(camera.id, {
        cameraId: camera.id,
        status: "offline",
        responseTimeMs: Date.now() - startedAt,
        streamActive: false,
        videoLoss: true,
        quality: "verified",
        errorMessage: message,
        reasonCodes: ["camera_probe_failed"]
      }).catch(() => void 0);
    }
  }
  async measureCamera(camera, startedAt) {
    const rtspUrl = camera.rtspUrl;
    const stream = await measureRtspStream(rtspUrl, { ffprobePath: this.ffprobePath });
    const responseTimeMs = Date.now() - startedAt;
    if (!stream.reachable) {
      return {
        cameraId: camera.id,
        status: "offline",
        responseTimeMs,
        streamActive: false,
        videoLoss: true,
        quality: "verified",
        errorMessage: stream.error ?? "Camera RTSP stream is unreachable",
        reasonCodes: ["rtsp_unreachable"]
      };
    }
    const [packetLoss, frame] = await Promise.all([
      measureCameraPacketLoss(rtspUrl),
      captureRtspLumaFrame(rtspUrl, this.ffmpegPath)
    ]);
    const frameHealth = frame ? assessLumaFrame(this.frameStates.get(camera.id), frame) : null;
    if (frameHealth) this.frameStates.set(camera.id, frameHealth.state);
    const reasonCodes = [];
    if (stream.fps === null) reasonCodes.push("fps_unavailable");
    if (stream.bitrateKbps === null) reasonCodes.push("bitrate_unavailable");
    if (packetLoss === null) reasonCodes.push("packet_loss_unavailable");
    if (!frameHealth) {
      reasonCodes.push("freeze_detection_unavailable", "black_screen_detection_unavailable");
    } else {
      if (frameHealth.imageFrozen) reasonCodes.push("frozen_frame_detected");
      if (frameHealth.blackScreen) reasonCodes.push("black_screen_detected");
    }
    const degraded = Boolean(
      camera.expectedFps && stream.fps !== null && stream.fps < camera.expectedFps * 0.8 || camera.expectedBitrate && stream.bitrateKbps !== null && stream.bitrateKbps < camera.expectedBitrate * 0.7 || packetLoss !== null && packetLoss > 5 || frameHealth?.imageFrozen || frameHealth?.blackScreen
    );
    return {
      cameraId: camera.id,
      status: degraded ? "degraded" : "online",
      responseTimeMs,
      streamActive: true,
      videoLoss: false,
      quality: "verified",
      ...stream.fps === null ? {} : { currentFps: stream.fps },
      ...stream.bitrateKbps === null ? {} : { currentBitrate: stream.bitrateKbps },
      ...stream.width === null || stream.height === null ? {} : { currentResolution: { width: stream.width, height: stream.height } },
      ...packetLoss === null ? {} : { packetLoss },
      ...frameHealth ? { imageFrozen: frameHealth.imageFrozen, blackScreen: frameHealth.blackScreen } : {},
      ...stream.codec ? { codec: stream.codec } : {},
      metadata: {
        sampleDurationSeconds: stream.sampleDurationSeconds,
        ...frameHealth ? { frameBrightness: frameHealth.brightness, freezeSamples: frameHealth.state.identicalSamples } : {},
        ...packetLoss === null ? {} : { packetLossMethod: "icmp" }
      },
      reasonCodes
    };
  }
  async sendToPlatform(cameraId, data) {
    const observedAt = (/* @__PURE__ */ new Date()).toISOString();
    const payload = {
      branchId: this.branchId,
      edgeAgentId: this.edgeAgentId,
      deviceType: "camera",
      deviceId: cameraId,
      observedAt,
      source: "rtsp",
      quality: data.quality,
      idempotencyKey: `${this.edgeAgentId}:camera:${cameraId}:${observedAt}`,
      metrics: {
        status: data.status,
        responseTimeMs: data.responseTimeMs,
        streamActive: data.streamActive,
        videoLoss: data.videoLoss,
        width: data.currentResolution?.width ?? null,
        height: data.currentResolution?.height ?? null,
        codec: data.codec ?? null,
        fps: data.currentFps ?? null,
        bitrateKbps: data.currentBitrate ?? null,
        packetLossPercent: data.packetLoss ?? null,
        imageFrozen: data.imageFrozen ?? null,
        blackScreen: data.blackScreen ?? null
      },
      reasonCodes: data.reasonCodes
    };
    if (this.telemetrySender) {
      await this.telemetrySender(payload);
      return;
    }
    const response = await fetch(`${this.apiEndpoint}/v1/edge-agents/${encodeURIComponent(this.edgeAgentId)}/telemetry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.developmentUserId ? { "x-user-id": this.developmentUserId } : {},
        ...this.edgeAuthCredential?.startsWith("sggw_") ? { "x-edge-agent-token": this.edgeAuthCredential } : this.edgeAuthCredential ? { "x-edge-bridge-key": this.edgeAuthCredential } : {}
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  getStats() {
    const cameras = [...this.cameras.values()];
    return { totalCameras: cameras.length, enabledCameras: cameras.filter((camera) => camera.enabled).length, isRunning: this.isRunning };
  }
};
var heartbeatService = null;
function initializeCameraHeartbeat(apiEndpoint, branchId, edgeAgentId, developmentUserId, ffprobePath = "ffprobe", ffmpegPath = "ffmpeg", edgeAuthCredential, telemetrySender) {
  if (!heartbeatService) {
    heartbeatService = new CameraHeartbeatService(
      apiEndpoint,
      branchId,
      edgeAgentId,
      developmentUserId,
      ffprobePath,
      ffmpegPath,
      edgeAuthCredential,
      telemetrySender
    );
  }
  return heartbeatService;
}

// src/runtime.ts
var import_node_fs3 = require("node:fs");
var import_node_path3 = require("node:path");

// src/embedded-config.ts
var import_node_fs2 = require("node:fs");
var EMBEDDED_CONFIG_MARKER = Buffer.from("SENTINEL_EDGE_CONFIG_V1", "ascii");
var MAX_EMBEDDED_CONFIG_BYTES = 256 * 1024;
function readEmbeddedEnvironmentFile(executablePath = process.execPath) {
  let descriptor;
  try {
    descriptor = (0, import_node_fs2.openSync)(executablePath, "r");
    const size = (0, import_node_fs2.fstatSync)(descriptor).size;
    const footerLength = EMBEDDED_CONFIG_MARKER.length + 4;
    if (size < footerLength) return void 0;
    const footer = Buffer.alloc(footerLength);
    (0, import_node_fs2.readSync)(descriptor, footer, 0, footer.length, size - footerLength);
    if (!footer.subarray(4).equals(EMBEDDED_CONFIG_MARKER)) return void 0;
    const configLength = footer.readUInt32LE(0);
    if (configLength < 1 || configLength > MAX_EMBEDDED_CONFIG_BYTES || configLength > size - footerLength) {
      throw new Error("The embedded branch configuration has an invalid length");
    }
    const content = Buffer.alloc(configLength);
    (0, import_node_fs2.readSync)(descriptor, content, 0, content.length, size - footerLength - configLength);
    return content.toString("utf8");
  } finally {
    if (descriptor !== void 0) (0, import_node_fs2.closeSync)(descriptor);
  }
}

// src/runtime.ts
function prepareEdgeRuntime(argv = process.argv.slice(2), environment = process.env) {
  const packaged = Boolean(process.pkg);
  const executableDirectory = (0, import_node_path3.dirname)(process.execPath);
  const configuredHome = environment.EDGE_AGENT_HOME;
  const homeDirectory = (0, import_node_path3.resolve)(configuredHome || (packaged ? executableDirectory : process.cwd()));
  const explicitConfig = argumentValue(argv, "--config") || environment.EDGE_AGENT_CONFIG_PATH;
  const candidates = explicitConfig ? [(0, import_node_path3.isAbsolute)(explicitConfig) ? explicitConfig : (0, import_node_path3.resolve)(process.cwd(), explicitConfig)] : [
    (0, import_node_path3.join)(homeDirectory, "config", "edge-agent.env"),
    (0, import_node_path3.join)(homeDirectory, "edge-agent.env"),
    (0, import_node_path3.join)(homeDirectory, ".env")
  ];
  const configPath = candidates.find((candidate) => (0, import_node_fs3.existsSync)(candidate)) ?? null;
  if (explicitConfig && !configPath) throw new Error(`Edge-agent configuration file not found: ${candidates[0]}`);
  const embeddedEnvironmentFile = !configPath && packaged ? readEmbeddedEnvironmentFile(process.execPath) : void 0;
  if (configPath || embeddedEnvironmentFile) {
    const values = parseEnvironmentFile(configPath ? (0, import_node_fs3.readFileSync)(configPath, "utf8") : embeddedEnvironmentFile);
    for (const [key2, value] of Object.entries(values)) {
      if (environment[key2] === void 0) environment[key2] = value;
    }
  }
  environment.EDGE_AGENT_HOME ??= homeDirectory;
  if (packaged) process.chdir(homeDirectory);
  return {
    packaged,
    homeDirectory,
    configPath,
    ...embeddedEnvironmentFile ? { embeddedEnvironmentFile } : {}
  };
}
function parseEnvironmentFile(content) {
  const values = {};
  for (const originalLine of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator < 1) continue;
    const key2 = normalized.slice(0, separator).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key2)) continue;
    values[key2] = unquote(normalized.slice(separator + 1).trim());
  }
  return values;
}
function hasArgument(argv, name) {
  return argv.includes(name);
}
function argumentValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : void 0;
}
function unquote(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

// src/streaming/edge-live-gateway.ts
var import_node_http2 = require("node:http");
var import_node_crypto6 = require("node:crypto");
var import_node_child_process4 = require("node:child_process");
var import_promises4 = require("node:fs/promises");
var import_node_path4 = require("node:path");
var EdgeLiveGateway = class {
  constructor(options) {
    this.options = options;
    this.access = new EdgeAccessRegistry(options.router, options.accessTtlMs);
    this.server = (0, import_node_http2.createServer)((request, response) => {
      void this.handle(request, response).catch((error) => {
        logger.error("Edge live gateway request failed", { error: error instanceof Error ? error.message : String(error) });
        if (!response.headersSent) sendJson(response, 502, { error: "media_gateway_failure" });
        else response.destroy(error instanceof Error ? error : void 0);
      });
    });
  }
  access;
  server;
  async listen(input) {
    await new Promise((resolve3, reject) => {
      const onError = (error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        resolve3();
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(input.port, input.host);
    });
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("Edge live gateway did not bind a TCP address");
    return { host: input.host, port: address.port };
  }
  async close() {
    if (!this.server.listening) return;
    await new Promise((resolve3, reject) => this.server.close((error) => error ? reject(error) : resolve3()));
  }
  async handle(request, response) {
    const url = new URL(request.url ?? "/", "http://edge.local");
    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { status: "ok", service: "sentinel-edge-media-gateway" });
    }
    if (["GET", "HEAD", "OPTIONS"].includes(request.method ?? "") && url.pathname.startsWith("/hls/")) {
      return this.proxyHls(request, response);
    }
    if (request.method === "POST" && url.pathname === "/v1/live/start") {
      if (this.options.edgeBridgeSharedKey && !secureEqualHeader(request.headers["x-edge-bridge-key"], this.options.edgeBridgeSharedKey)) {
        return sendJson(response, 401, { error: "invalid_bridge_identity" });
      }
      const body = await readJsonBody(request);
      if (typeof body.controlPlaneToken !== "string" || body.controlPlaneToken.length < 32) {
        return sendJson(response, 400, { error: "invalid_request" });
      }
      const consumed = await this.options.consumer.consume(body.controlPlaneToken);
      const sourceUri = this.options.resolveSecret(consumed.connectionSecretRef);
      if (!sourceUri) return sendJson(response, 503, { error: "stream_secret_unavailable" });
      const path = `camera-${safeIdentifier(consumed.cameraId)}`;
      await this.options.router.ensurePath(path, sourceUri);
      const session = this.access.issue(path);
      return sendJson(response, 201, {
        sessionId: session.id,
        cameraId: consumed.cameraId,
        path,
        expiresAt: session.expiresAt,
        hls: {
          url: `${stripSlash(this.options.publicBaseUrl())}/hls/${path}/index.m3u8`,
          bearerToken: session.token
        }
      });
    }
    if (request.method === "POST" && url.pathname === "/internal/mediamtx/auth") {
      const body = await readJsonBody(request);
      const action = typeof body.action === "string" ? body.action : "";
      const path = typeof body.path === "string" ? body.path : "";
      const token = typeof body.token === "string" ? body.token : "";
      const password = typeof body.password === "string" ? body.password : "";
      const query = typeof body.query === "string" ? body.query : "";
      const credential = token || password || new URLSearchParams(query).get("token") || "";
      if (!this.access.authenticate(credential, path, action)) {
        return sendJson(response, 401, { error: "media_access_denied" });
      }
      response.writeHead(204).end();
      return;
    }
    sendJson(response, 404, { error: "not_found" });
  }
  async proxyHls(request, response) {
    const origin = typeof request.headers.origin === "string" ? request.headers.origin : "*";
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Range");
    response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    response.setHeader("Vary", "Origin");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    const suffix = (request.url ?? "/hls/").slice("/hls".length) || "/";
    const upstream = await fetch(new URL(suffix, this.options.mediaMtxHlsUrl), {
      method: request.method ?? "GET",
      headers: forwardMediaHeaders(request.headers)
    });
    response.statusCode = upstream.status;
    for (const name of ["accept-ranges", "cache-control", "content-length", "content-type"]) {
      const value = upstream.headers.get(name);
      if (value) response.setHeader(name, value);
    }
    if (request.method === "HEAD" || upstream.status === 204) {
      response.end();
      return;
    }
    response.end(Buffer.from(await upstream.arrayBuffer()));
  }
};
function buildEdgeLiveGateway(options) {
  return new EdgeLiveGateway(options);
}
async function startEdgeMediaRuntime(input) {
  const { config } = input;
  const runtimeDirectory = (0, import_node_path4.join)(process.env.EDGE_AGENT_HOME ?? process.cwd(), "runtime");
  await (0, import_promises4.mkdir)(runtimeDirectory, { recursive: true });
  const mediaConfigPath = (0, import_node_path4.join)(runtimeDirectory, "mediamtx.yml");
  await (0, import_promises4.writeFile)(mediaConfigPath, mediaMtxConfiguration(config), "utf8");
  const mediaMtx = config.MEDIA_RUNTIME_MANAGED ? startManagedProcess("MediaMTX", config.MEDIAMTX_PATH, [mediaConfigPath], runtimeDirectory) : void 0;
  await waitForHttp(new URL("/v3/config/global/get", config.MEDIAMTX_API_URL), mediaMtx, 3e4);
  const router = new MediaMtxRouter(config.MEDIAMTX_API_URL);
  let resolvedPublicUrl = config.PUBLIC_MEDIA_GATEWAY_URL ?? "";
  const liveGateway = buildEdgeLiveGateway({
    consumer: { consume: (token) => input.gateway.consumeLiveSession(input.agentId, token) },
    router,
    resolveSecret: (reference) => input.secrets.get(reference),
    ...config.EDGE_BRIDGE_SHARED_KEY ? { edgeBridgeSharedKey: config.EDGE_BRIDGE_SHARED_KEY } : {},
    publicBaseUrl: () => resolvedPublicUrl,
    mediaMtxHlsUrl: config.MEDIAMTX_HLS_URL,
    accessTtlMs: config.MEDIA_ACCESS_TTL_SECONDS * 1e3
  });
  await liveGateway.listen({ host: config.EDGE_LIVE_GATEWAY_HOST, port: config.EDGE_LIVE_GATEWAY_PORT });
  let tunnel;
  try {
    if (config.MEDIA_TUNNEL_MODE === "quick") {
      const started = await startQuickTunnel(
        config.CLOUDFLARED_PATH,
        `http://${config.EDGE_LIVE_GATEWAY_HOST}:${config.EDGE_LIVE_GATEWAY_PORT}`,
        runtimeDirectory
      );
      tunnel = started.process;
      resolvedPublicUrl = started.publicUrl;
      logger.warn("Quick media tunnel is active; use a named tunnel for production", { publicUrl: resolvedPublicUrl });
    } else if (config.MEDIA_TUNNEL_MODE === "named") {
      tunnel = startNamedTunnel(config.CLOUDFLARED_PATH, config.CLOUDFLARED_TUNNEL_TOKEN, runtimeDirectory);
      resolvedPublicUrl = config.PUBLIC_MEDIA_GATEWAY_URL;
    }
    if (!resolvedPublicUrl) throw new Error("No public media gateway URL was established");
    await waitForPublicGateway(new URL("/health", resolvedPublicUrl), 3e4);
    logger.info("Edge live media is reachable", { publicUrl: resolvedPublicUrl, tunnelMode: config.MEDIA_TUNNEL_MODE });
  } catch (error) {
    tunnel?.kill();
    await liveGateway.close();
    mediaMtx?.kill();
    throw error;
  }
  return {
    publicUrl: resolvedPublicUrl,
    async stop() {
      tunnel?.kill();
      await liveGateway.close().catch(() => void 0);
      mediaMtx?.kill();
    }
  };
}
var MediaMtxRouter = class {
  constructor(apiUrl) {
    this.apiUrl = apiUrl;
  }
  async ensurePath(path, sourceUri) {
    const encodedPath = encodeURIComponent(path);
    const payload = {
      source: sourceUri,
      rtspTransport: "tcp",
      sourceOnDemand: true,
      sourceOnDemandStartTimeout: "10s",
      sourceOnDemandCloseAfter: "10s"
    };
    const add = await fetch(new URL(`/v3/config/paths/add/${encodedPath}`, this.apiUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (add.ok) return;
    if (add.status !== 400 && add.status !== 409) throw new Error(`MediaMTX rejected path creation (${add.status})`);
    const patch = await fetch(new URL(`/v3/config/paths/patch/${encodedPath}`, this.apiUrl), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!patch.ok) throw new Error(`MediaMTX rejected path update (${patch.status})`);
  }
  async removePath(path) {
    const response = await fetch(new URL(`/v3/config/paths/delete/${encodeURIComponent(path)}`, this.apiUrl), { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error(`MediaMTX rejected path deletion (${response.status})`);
  }
};
var EdgeAccessRegistry = class {
  constructor(router, ttlMs) {
    this.router = router;
    this.ttlMs = ttlMs;
  }
  sessions = /* @__PURE__ */ new Map();
  issue(path) {
    const session = { id: (0, import_node_crypto6.randomUUID)(), path, token: (0, import_node_crypto6.randomBytes)(32).toString("base64url"), expiresAt: Date.now() + this.ttlMs };
    this.sessions.set(session.id, session);
    const timer = setTimeout(() => void this.expire(session.id), this.ttlMs);
    timer.unref();
    return { ...session, expiresAt: new Date(session.expiresAt).toISOString() };
  }
  authenticate(token, path, action) {
    return action === "read" && [...this.sessions.values()].some((session) => session.path === path && session.expiresAt > Date.now() && secureEqual2(session.token, token));
  }
  async expire(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    if (![...this.sessions.values()].some((item) => item.path === session.path && item.expiresAt > Date.now())) {
      await this.router.removePath(session.path).catch(() => void 0);
    }
  }
};
function mediaMtxConfiguration(config) {
  return `logLevel: info
api: yes
apiAddress: 127.0.0.1:9997
authMethod: http
authHTTPAddress: http://127.0.0.1:${config.EDGE_LIVE_GATEWAY_PORT}/internal/mediamtx/auth
authHTTPExclude:
  - action: api
  - action: metrics
  - action: pprof
hls: yes
hlsAddress: 127.0.0.1:8888
hlsVariant: lowLatency
hlsAllowOrigins: ['*']
webrtc: no
pathDefaults:
  sourceOnDemand: yes
  sourceOnDemandStartTimeout: 10s
  sourceOnDemandCloseAfter: 10s
paths: {}
`;
}
function startManagedProcess(name, executable, args, cwd, environment) {
  const child = (0, import_node_child_process4.spawn)(executable, args, {
    cwd,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: environment ? { ...process.env, ...environment } : process.env
  });
  child.stdin.end();
  pipeProcessLogs(name, child);
  child.once("exit", (code, signal) => logger.error(`${name} exited`, { code, signal }));
  return child;
}
async function startQuickTunnel(executable, origin, cwd) {
  const child = startManagedProcess("Cloudflare Tunnel", executable, ["tunnel", "--no-autoupdate", "--url", origin], cwd);
  const publicUrl = await new Promise((resolve3, reject) => {
    const timeout = setTimeout(() => reject(new Error("Cloudflare quick tunnel did not provide a URL within 30 seconds")), 3e4);
    let output = "";
    const inspect = (chunk) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-8192);
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match) {
        clearTimeout(timeout);
        resolve3(match[0]);
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Cloudflare quick tunnel exited (${code})`));
    });
  });
  return { process: child, publicUrl };
}
function startNamedTunnel(executable, token, cwd) {
  return startManagedProcess("Cloudflare Tunnel", executable, ["tunnel", "--no-autoupdate", "run"], cwd, { TUNNEL_TOKEN: token });
}
function pipeProcessLogs(name, child) {
  const report = (level, chunk) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/).filter(Boolean)) logger[level](`${name}: ${line}`);
  };
  child.stdout.on("data", (chunk) => report("info", chunk));
  child.stderr.on("data", (chunk) => report("warn", chunk));
}
async function waitForHttp(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`MediaMTX exited before becoming ready (${child.exitCode})`);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1e3) })).ok) return;
    } catch {
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
async function waitForPublicGateway(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2e3) })).ok) return;
    } catch {
    }
    await delay(500);
  }
  throw new Error(`Public media tunnel is not reachable at ${url.origin}`);
}
async function readJsonBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 64 * 1024) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}
function sendJson(response, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  response.writeHead(status, { "content-type": "application/json", "content-length": data.length });
  response.end(data);
}
function delay(milliseconds) {
  return new Promise((resolve3) => setTimeout(resolve3, milliseconds));
}
function safeIdentifier(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}
function stripSlash(value) {
  return value.replace(/\/+$/, "");
}
function secureEqual2(left, right) {
  const supplied = Buffer.from(left);
  const expected = Buffer.from(right);
  return supplied.length === expected.length && (0, import_node_crypto6.timingSafeEqual)(supplied, expected);
}
function secureEqualHeader(value, expected) {
  return typeof value === "string" && secureEqual2(value, expected);
}
function forwardMediaHeaders(headers) {
  const forwarded = {};
  for (const name of ["accept", "origin", "range", "user-agent"]) {
    const value = headers[name];
    if (typeof value === "string") forwarded[name] = value;
  }
  return forwarded;
}

// src/windows/self-installer.ts
var import_node_fs4 = require("node:fs");
var import_node_child_process5 = require("node:child_process");
var import_node_path5 = require("node:path");
var import_node_url = require("node:url");
var import_meta = {};
var __filename = (0, import_node_url.fileURLToPath)(import_meta.url);
var __dirname = (0, import_node_path5.dirname)(__filename);
var ASSET_ROOT = (0, import_node_path5.join)(__dirname, "..", "vendor", "windows");
var INSTALLER_ROOT = (0, import_node_path5.join)(__dirname, "..", "installer", "windows");
var REQUIRED_BUNDLE_ASSETS = [
  ["ffmpeg.zip", (0, import_node_path5.join)(ASSET_ROOT, "ffmpeg.zip")],
  ["mediamtx.zip", (0, import_node_path5.join)(ASSET_ROOT, "mediamtx.zip")],
  ["cloudflared.exe", (0, import_node_path5.join)(ASSET_ROOT, "cloudflared.exe")],
  ["install-edge-agent.ps1", (0, import_node_path5.join)(INSTALLER_ROOT, "install-edge-agent.ps1")],
  ["uninstall-edge-agent.ps1", (0, import_node_path5.join)(INSTALLER_ROOT, "uninstall-edge-agent.ps1")]
];
function inspectBundledWindowsRuntime() {
  return REQUIRED_BUNDLE_ASSETS.map(([name, path]) => {
    if (!(0, import_node_fs4.existsSync)(path)) throw new Error(`The all-in-one installer is missing ${name}`);
    const sizeBytes = (0, import_node_fs4.statSync)(path).size;
    if (sizeBytes <= 0) throw new Error(`The bundled ${name} is empty`);
    return { name, sizeBytes };
  });
}
function launchWindowsSelfInstaller(environmentFile) {
  if (process.platform !== "win32") throw new Error("The embedded installer can only run on Windows");
  const stage = (0, import_node_path5.join)(process.env.TEMP ?? process.cwd(), `SentinelGridEdgeInstall-${process.pid}`);
  (0, import_node_fs4.rmSync)(stage, { recursive: true, force: true });
  (0, import_node_fs4.mkdirSync)((0, import_node_path5.join)(stage, "config"), { recursive: true });
  (0, import_node_fs4.mkdirSync)((0, import_node_path5.join)(stage, "runtime-packages"), { recursive: true });
  try {
    (0, import_node_fs4.copyFileSync)(process.execPath, (0, import_node_path5.join)(stage, "edge-agent.exe"));
    (0, import_node_fs4.writeFileSync)((0, import_node_path5.join)(stage, "config", "edge-agent.env"), environmentFile, "utf8");
    copyAsset((0, import_node_path5.join)(ASSET_ROOT, "ffmpeg.zip"), (0, import_node_path5.join)(stage, "runtime-packages", "ffmpeg.zip"));
    copyAsset((0, import_node_path5.join)(ASSET_ROOT, "mediamtx.zip"), (0, import_node_path5.join)(stage, "runtime-packages", "mediamtx.zip"));
    copyAsset((0, import_node_path5.join)(ASSET_ROOT, "cloudflared.exe"), (0, import_node_path5.join)(stage, "runtime-packages", "cloudflared.exe"));
    copyAsset((0, import_node_path5.join)(INSTALLER_ROOT, "install-edge-agent.ps1"), (0, import_node_path5.join)(stage, "install-edge-agent.ps1"));
    copyAsset((0, import_node_path5.join)(INSTALLER_ROOT, "uninstall-edge-agent.ps1"), (0, import_node_path5.join)(stage, "uninstall-edge-agent.ps1"));
    copyOptionalAsset((0, import_node_path5.join)(ASSET_ROOT, "THIRD_PARTY_NOTICES.txt"), (0, import_node_path5.join)(stage, "THIRD_PARTY_NOTICES.txt"));
    const installerPath = (0, import_node_path5.join)(stage, "install-edge-agent.ps1");
    const command = `$process = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',${powerShellLiteral(installerPath)}) -Verb RunAs -Wait -PassThru; exit $process.ExitCode`;
    const encoded = Buffer.from(command, "utf16le").toString("base64");
    const result2 = (0, import_node_child_process5.spawnSync)("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      stdio: "inherit",
      windowsHide: false
    });
    if (result2.error) throw result2.error;
    if (result2.status !== 0) throw new Error(`Installation was cancelled or failed (exit ${result2.status ?? "unknown"})`);
  } finally {
    (0, import_node_fs4.rmSync)(stage, { recursive: true, force: true });
  }
}
function copyAsset(source, destination) {
  if (!(0, import_node_fs4.existsSync)(source)) throw new Error(`The all-in-one installer is missing ${source.split(/[\\/]/).at(-1)}`);
  (0, import_node_fs4.writeFileSync)(destination, (0, import_node_fs4.readFileSync)(source));
}
function copyOptionalAsset(source, destination) {
  if ((0, import_node_fs4.existsSync)(source)) (0, import_node_fs4.writeFileSync)(destination, (0, import_node_fs4.readFileSync)(source));
}
function powerShellLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

// src/security/device-identity.ts
var import_node_crypto7 = require("node:crypto");
var import_promises5 = require("node:fs/promises");
var import_node_path6 = require("node:path");
var DeviceIdentityStore = class {
  constructor(identityPath, keyPath) {
    this.identityPath = identityPath;
    this.keyPath = keyPath;
  }
  async load() {
    let raw;
    try {
      raw = await (0, import_promises5.readFile)(this.identityPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return void 0;
      throw error;
    }
    const envelope = JSON.parse(raw);
    if (envelope.version !== 1) throw new Error("unsupported_device_identity_version");
    const key2 = await this.readKey();
    const decipher = (0, import_node_crypto7.createDecipheriv)("aes-256-gcm", key2, Buffer.from(envelope.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final()
    ]);
    return validateIdentity(JSON.parse(plaintext.toString("utf8")));
  }
  async save(identity) {
    const validated = validateIdentity(identity);
    const key2 = await this.loadOrCreateKey();
    const iv = (0, import_node_crypto7.randomBytes)(12);
    const cipher = (0, import_node_crypto7.createCipheriv)("aes-256-gcm", key2, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(validated), "utf8"),
      cipher.final()
    ]);
    const envelope = {
      version: 1,
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url")
    };
    await (0, import_promises5.mkdir)((0, import_node_path6.dirname)(this.identityPath), { recursive: true });
    const temporary = `${this.identityPath}.${process.pid}.tmp`;
    await (0, import_promises5.writeFile)(temporary, JSON.stringify(envelope), { encoding: "utf8", mode: 384 });
    await (0, import_promises5.rename)(temporary, this.identityPath);
  }
  static newDeviceUuid() {
    return (0, import_node_crypto7.randomUUID)();
  }
  static newCommandKeyPair() {
    const { publicKey, privateKey } = (0, import_node_crypto7.generateKeyPairSync)("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    return { publicKey, privateKey };
  }
  async readKey() {
    const key2 = Buffer.from((await (0, import_promises5.readFile)(this.keyPath, "utf8")).trim(), "base64url");
    if (key2.length !== 32) throw new Error("invalid_device_identity_key");
    return key2;
  }
  async loadOrCreateKey() {
    try {
      return await this.readKey();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const key2 = (0, import_node_crypto7.randomBytes)(32);
    await (0, import_promises5.mkdir)((0, import_node_path6.dirname)(this.keyPath), { recursive: true });
    await (0, import_promises5.writeFile)(this.keyPath, key2.toString("base64url"), { encoding: "utf8", mode: 384, flag: "wx" }).catch(async (error) => {
      if (error.code !== "EEXIST") throw error;
    });
    return this.readKey();
  }
};
function validateIdentity(value) {
  if (!value || typeof value !== "object") throw new Error("invalid_device_identity");
  const candidate = value;
  for (const key2 of ["deviceUuid", "agentId", "branchId", "credential", "enrolledAt"]) {
    if (typeof candidate[key2] !== "string" || !candidate[key2]) throw new Error("invalid_device_identity");
  }
  if (candidate.media && (candidate.media.enabled !== true || candidate.media.managed !== true || candidate.media.mode !== "named" || typeof candidate.media.publicUrl !== "string" || !candidate.media.publicUrl.startsWith("https://") || typeof candidate.media.tunnelToken !== "string" || candidate.media.tunnelToken.length < 20)) throw new Error("invalid_device_media_identity");
  return candidate;
}

// src/offline/encrypted-outbox.ts
var import_node_crypto8 = require("node:crypto");
var import_promises6 = require("node:fs/promises");
var import_node_path7 = require("node:path");
var EncryptedOutbox = class {
  constructor(path, keyPath, maxItems = 1e4) {
    this.path = path;
    this.keyPath = keyPath;
    this.maxItems = maxItems;
  }
  items = [];
  async load() {
    let raw;
    try {
      raw = await (0, import_promises6.readFile)(this.path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    const envelope = JSON.parse(raw);
    const key2 = await this.readKey();
    const decipher = (0, import_node_crypto8.createDecipheriv)("aes-256-gcm", key2, Buffer.from(envelope.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final()
    ]);
    const values = JSON.parse(plaintext.toString("utf8"));
    if (!Array.isArray(values)) throw new Error("invalid_offline_outbox");
    this.items = values.slice(0, this.maxItems);
  }
  async enqueue(request) {
    if (this.items.length >= this.maxItems) throw new Error("offline_outbox_capacity_exceeded");
    this.items.push({ ...request, id: (0, import_node_crypto8.randomUUID)(), queuedAt: (/* @__PURE__ */ new Date()).toISOString(), attempts: 0 });
    await this.persist();
    return this.items.length;
  }
  async flush(sender, limit = 100) {
    let delivered = 0;
    while (this.items.length > 0 && delivered < limit) {
      const item = this.items[0];
      try {
        await sender(item);
        this.items.shift();
        delivered += 1;
      } catch {
        item.attempts += 1;
        break;
      }
    }
    if (delivered > 0 || this.items[0]?.attempts) await this.persist();
    return { delivered, pending: this.items.length };
  }
  get pending() {
    return this.items.length;
  }
  async persist() {
    const key2 = await this.loadOrCreateKey();
    const iv = (0, import_node_crypto8.randomBytes)(12);
    const cipher = (0, import_node_crypto8.createCipheriv)("aes-256-gcm", key2, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(this.items), "utf8"), cipher.final()]);
    const envelope = {
      version: 1,
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url")
    };
    await (0, import_promises6.mkdir)((0, import_node_path7.dirname)(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await (0, import_promises6.writeFile)(temporary, JSON.stringify(envelope), { encoding: "utf8", mode: 384 });
    await (0, import_promises6.rename)(temporary, this.path);
  }
  async readKey() {
    const key2 = Buffer.from((await (0, import_promises6.readFile)(this.keyPath, "utf8")).trim(), "base64url");
    if (key2.length !== 32) throw new Error("invalid_offline_outbox_key");
    return key2;
  }
  async loadOrCreateKey() {
    try {
      return await this.readKey();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const key2 = (0, import_node_crypto8.randomBytes)(32);
    await (0, import_promises6.mkdir)((0, import_node_path7.dirname)(this.keyPath), { recursive: true });
    await (0, import_promises6.writeFile)(this.keyPath, key2.toString("base64url"), { encoding: "utf8", mode: 384, flag: "wx" }).catch(async (error) => {
      if (error.code !== "EEXIST") throw error;
    });
    return this.readKey();
  }
};

// src/updates/signed-update.ts
var import_node_crypto9 = require("node:crypto");
var import_promises7 = require("node:fs/promises");
var import_node_path8 = require("node:path");
var MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
async function stageSignedUpdate(release, publicKeyPem, stagingRoot) {
  if (!verifyManifest(release, publicKeyPem)) throw new Error("update_signature_invalid");
  const url = new URL(release.artifactUrl);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("update_artifact_requires_https");
  }
  const targetDirectory = (0, import_node_path8.join)(stagingRoot, safe(release.version));
  const temporaryPath = (0, import_node_path8.join)(targetDirectory, `artifact.${process.pid}.part`);
  const artifactPath = (0, import_node_path8.join)(targetDirectory, "edge-agent.bundle");
  await (0, import_promises7.mkdir)(targetDirectory, { recursive: true });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5 * 6e4) });
    if (!response.ok || !response.body) throw new Error(`update_download_failed_${response.status}`);
    const file = await (0, import_promises7.open)(temporaryPath, "w", 384);
    const hash = (0, import_node_crypto9.createHash)("sha256");
    let bytes = 0;
    try {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_ARTIFACT_BYTES) throw new Error("update_artifact_too_large");
        hash.update(value);
        await file.write(value);
      }
    } finally {
      await file.close();
    }
    const digest = hash.digest("hex");
    if (digest !== release.sha256.toLowerCase()) throw new Error("update_checksum_mismatch");
    await (0, import_promises7.rename)(temporaryPath, artifactPath);
    const marker = {
      releaseId: release.id,
      version: release.version,
      artifactPath,
      sha256: digest,
      signature: release.signature,
      stagedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await (0, import_promises7.writeFile)((0, import_node_path8.join)(targetDirectory, "ready.json"), JSON.stringify(marker, null, 2), { encoding: "utf8", mode: 384 });
    return { ...marker, bytes };
  } catch (error) {
    await (0, import_promises7.unlink)(temporaryPath).catch(() => void 0);
    throw error;
  }
}
function verifyManifest(release, publicKeyPem) {
  try {
    const key2 = (0, import_node_crypto9.createPublicKey)(publicKeyPem.replaceAll("\\n", "\n"));
    if (key2.asymmetricKeyType !== "ed25519") return false;
    const canonical = Buffer.from(JSON.stringify({
      artifactUrl: release.artifactUrl,
      notes: release.notes,
      sha256: release.sha256.toLowerCase(),
      version: release.version
    }), "utf8");
    return (0, import_node_crypto9.verify)(null, canonical, key2, Buffer.from(release.signature, "base64url"));
  } catch {
    return false;
  }
}
function safe(value) {
  return value.replace(/[^0-9A-Za-z._-]/g, "-");
}

// src/index.ts
var import_promises9 = require("node:fs/promises");

// src/security/camera-credential-vault.ts
var import_node_crypto10 = require("node:crypto");
var import_promises8 = require("node:fs/promises");
var import_node_path9 = require("node:path");
var CameraCredentialVault = class {
  constructor(path, keyPath) {
    this.path = path;
    this.keyPath = keyPath;
  }
  values = {};
  async load() {
    let raw;
    try {
      raw = await (0, import_promises8.readFile)(this.path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    const envelope = JSON.parse(raw);
    if (envelope.version !== 1) throw new Error("unsupported_camera_credential_vault");
    const key2 = await this.readKey();
    const decipher = (0, import_node_crypto10.createDecipheriv)("aes-256-gcm", key2, Buffer.from(envelope.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final()
    ]);
    const parsed = JSON.parse(plaintext.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_camera_credential_vault");
    this.values = parsed;
  }
  get(host) {
    return this.values[`host:${host}`] ?? this.values.default;
  }
  async set(input) {
    const key2 = input.host ? `host:${input.host}` : "default";
    this.values[key2] = { username: input.username, password: input.password, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await this.persist();
    return { scope: input.host ? "single-camera" : "branch-default", updatedAt: this.values[key2].updatedAt };
  }
  async persist() {
    const key2 = await this.loadOrCreateKey();
    const iv = (0, import_node_crypto10.randomBytes)(12);
    const cipher = (0, import_node_crypto10.createCipheriv)("aes-256-gcm", key2, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(this.values), "utf8"), cipher.final()]);
    const envelope = {
      version: 1,
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url")
    };
    await (0, import_promises8.mkdir)((0, import_node_path9.dirname)(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await (0, import_promises8.writeFile)(temporary, JSON.stringify(envelope), { encoding: "utf8", mode: 384 });
    await (0, import_promises8.rename)(temporary, this.path);
  }
  async readKey() {
    const key2 = Buffer.from((await (0, import_promises8.readFile)(this.keyPath, "utf8")).trim(), "base64url");
    if (key2.length !== 32) throw new Error("invalid_camera_credential_vault_key");
    return key2;
  }
  async loadOrCreateKey() {
    try {
      return await this.readKey();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const key2 = (0, import_node_crypto10.randomBytes)(32);
    await (0, import_promises8.mkdir)((0, import_node_path9.dirname)(this.keyPath), { recursive: true });
    await (0, import_promises8.writeFile)(this.keyPath, key2.toString("base64url"), { encoding: "utf8", mode: 384, flag: "wx" }).catch(async (error) => {
      if (error.code !== "EEXIST") throw error;
    });
    return this.readKey();
  }
};
function openSealedCommand(envelope, privateKeyPem) {
  if (envelope.algorithm !== "RSA-OAEP-256+A256GCM") throw new Error("unsupported_command_envelope");
  const contentKey = (0, import_node_crypto10.privateDecrypt)({
    key: privateKeyPem,
    padding: import_node_crypto10.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256"
  }, Buffer.from(envelope.wrappedKey, "base64url"));
  const decipher = (0, import_node_crypto10.createDecipheriv)("aes-256-gcm", contentKey, Buffer.from(envelope.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

// src/recorders/dvr-adapter.ts
async function discoverRecorderChannels(input) {
  const sourceType = recorderChannelSource(input.model);
  const resolved = [];
  for (const profile of input.profiles.slice(0, 256)) {
    try {
      const rawUri = await input.getStreamUri(profile.token);
      const uri = attachCredentials(rawUri, input.credentials);
      resolved.push({
        profile,
        channel: recorderChannelNumber(profile, uri),
        role: streamRole(profile, uri),
        uri,
        reasonCodes: []
      });
    } catch (error) {
      resolved.push({
        profile,
        channel: recorderChannelNumber(profile),
        role: streamRole(profile),
        uri: null,
        reasonCodes: [classifyStreamUriFailure(error)]
      });
    }
  }
  const groups = groupProfilesByChannel(resolved);
  const channels = [];
  for (const [sourceChannel, profiles] of [...groups.entries()].sort((left, right) => left[0] - right[0])) {
    const primary = [...profiles].filter((item) => item.uri).sort(compareProfiles)[0];
    const probe = primary?.uri ? await input.probeStream(primary.uri) : null;
    const reasonCodes = unique([
      ...profiles.flatMap((item) => item.reasonCodes),
      ...primary?.uri ? [] : ["recorder_channel_stream_uri_unavailable"],
      ...probe?.reachable ? ["recorder_channel_rtsp_verified"] : probe ? ["recorder_channel_rtsp_unreachable"] : []
    ]);
    channels.push({
      sourceChannel,
      name: channelName(profiles, sourceChannel),
      sourceType,
      primaryStreamUri: primary?.uri ?? null,
      profiles: profiles.map(({ profile, role }) => ({
        name: role === "unknown" ? profile.name : role,
        codec: profile.codec,
        width: profile.width,
        height: profile.height,
        role
      })),
      streamVerified: Boolean(probe?.reachable),
      probe,
      reasonCodes
    });
  }
  return channels;
}
function recorderAdapterVendor(manufacturer) {
  const normalized = manufacturer.toLowerCase();
  if (/hikvision|hik vision/.test(normalized)) return "hikvision";
  if (/dahua/.test(normalized)) return "dahua";
  if (/cp[\s-]*plus/.test(normalized)) return "cp-plus";
  return "onvif";
}
function recorderChannelSource(model) {
  return /(?:^|[\s_-])(dvr|xvr|uvr)(?:$|[\s_-])/i.test(model) ? "analog-dvr-channel" : "nvr-channel";
}
function recorderChannelNumber(profile, uri) {
  if (uri) {
    try {
      const parsed = new URL(uri);
      const queryChannel = parsed.searchParams.get("channel") ?? parsed.searchParams.get("ch");
      if (queryChannel && positiveInteger(queryChannel)) return Number(queryChannel);
      const hikvision = parsed.pathname.match(/\/Streaming\/Channels\/(\d+)/i)?.[1];
      if (hikvision) {
        const track = Number(hikvision);
        return track >= 100 ? Math.floor(track / 100) : track;
      }
      const pathChannel = parsed.pathname.match(/(?:channel|ch)[/_-]?(\d+)/i)?.[1];
      if (pathChannel && positiveInteger(pathChannel)) return Number(pathChannel);
    } catch {
    }
  }
  for (const value of [profile.name, profile.token]) {
    const explicit = value.match(/(?:camera|channel|ch|input|profile)[\s_.:-]*0*(\d+)/i)?.[1];
    if (explicit && positiveInteger(explicit)) return Number(explicit);
  }
  return null;
}
function streamRole(profile, uri) {
  const value = `${profile.name} ${profile.token} ${uri ?? ""}`.toLowerCase();
  if (/subtype=1|(?:^|[^a-z])sub(?:stream)?(?:[^a-z]|$)|\/channels\/\d+02(?:\D|$)/.test(value)) return "sub";
  if (/subtype=0|(?:^|[^a-z])main(?:stream)?(?:[^a-z]|$)|\/channels\/\d+01(?:\D|$)/.test(value)) return "main";
  return "unknown";
}
function groupProfilesByChannel(profiles) {
  const groups = /* @__PURE__ */ new Map();
  let nextFallbackChannel = 1;
  for (const item of profiles) {
    let channel = item.channel;
    if (channel === null) {
      while (groups.has(nextFallbackChannel)) nextFallbackChannel++;
      channel = nextFallbackChannel++;
      item.reasonCodes.push("recorder_channel_number_inferred_from_profile_order");
    }
    const group = groups.get(channel) ?? [];
    group.push(item);
    groups.set(channel, group);
  }
  return groups;
}
function compareProfiles(left, right) {
  const rank = (item) => item.role === "main" ? 2 : item.role === "unknown" ? 1 : 0;
  return rank(right) - rank(left) || right.profile.width * right.profile.height - left.profile.width * left.profile.height;
}
function channelName(profiles, sourceChannel) {
  const named = profiles.map((item) => item.profile.name.trim()).find((name) => name && !/^(profile|main|sub|stream)[\s_.:-]*\d*$/i.test(name));
  return named ?? `Channel ${sourceChannel}`;
}
function positiveInteger(value) {
  return /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 65535;
}
function classifyStreamUriFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /401|403|unauthori|forbidden|credential|auth/i.test(message) ? "recorder_channel_credentials_rejected" : "recorder_channel_stream_uri_unavailable";
}
function unique(values) {
  return [...new Set(values)];
}

// src/index.ts
async function main() {
  const argv = process.argv.slice(2);
  if (hasArgument(argv, "--verify-bundle")) {
    process.stdout.write(`${JSON.stringify({ valid: true, assets: inspectBundledWindowsRuntime() }, null, 2)}
`);
    process.exit(0);
  }
  const runtime = prepareRuntimeOrExit(argv);
  if (runtime.embeddedEnvironmentFile && (argv.length === 0 || hasArgument(argv, "--install"))) {
    launchWindowsSelfInstaller(runtime.embeddedEnvironmentFile);
    process.exit(0);
  }
  if (hasArgument(argv, "--version")) {
    process.stdout.write("Sentinel Grid Edge Agent 0.1.0\n");
    process.exit(0);
  }
  const config = loadConfigOrExit();
  process.env.EDGE_LOG_PATH = config.EDGE_LOG_PATH;
  if (hasArgument(argv, "--check-config")) {
    process.stdout.write(`${JSON.stringify({
      valid: true,
      configPath: runtime.configPath,
      homeDirectory: runtime.homeDirectory,
      controlPlaneUrl: config.CONTROL_PLANE_URL,
      branchId: config.BRANCH_ID,
      edgeAgentId: config.EDGE_AGENT_ID ?? null,
      edgeAgentName: config.EDGE_AGENT_NAME,
      onvifEndpointCount: config.ONVIF_ENDPOINTS.split(",").filter(Boolean).length,
      recorderCount: config.RECORDERS_JSON.length
    }, null, 2)}
`);
    process.exit(0);
  }
  const gateway = new GatewayClient(
    config.CONTROL_PLANE_URL,
    config.DEV_USER_ID,
    config.EDGE_BRIDGE_SHARED_KEY,
    config.CONTROL_PLANE_TIMEOUT_MS,
    void 0
  );
  const identityStore = new DeviceIdentityStore(config.EDGE_IDENTITY_PATH, config.EDGE_IDENTITY_KEY_PATH);
  const outbox = new EncryptedOutbox(
    config.EDGE_OFFLINE_OUTBOX_PATH,
    config.EDGE_OFFLINE_OUTBOX_KEY_PATH,
    config.EDGE_OFFLINE_OUTBOX_MAX_ITEMS
  );
  await outbox.load();
  let identity = await identityStore.load();
  if (!identity && config.EDGE_ACTIVATION_CODE) {
    const deviceUuid = DeviceIdentityStore.newDeviceUuid();
    const commandKeys = DeviceIdentityStore.newCommandKeyPair();
    const activated = await gateway.activate(
      config.EDGE_ACTIVATION_CODE,
      deviceUuid,
      config.EDGE_AGENT_VERSION,
      commandKeys.publicKey
    );
    identity = {
      deviceUuid,
      agentId: activated.agentId,
      branchId: activated.branchId,
      credential: activated.credential,
      commandPublicKey: commandKeys.publicKey,
      commandPrivateKey: commandKeys.privateKey,
      ...activated.media ? { media: activated.media } : {},
      ...activated.updatePublicKey ? { updatePublicKey: activated.updatePublicKey } : {},
      enrolledAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await identityStore.save(identity);
  }
  if (identity) gateway.useEdgeCredential(identity.credential);
  const legacyAgentId = !identity && config.EDGE_AGENT_ID && config.BRANCH_ID ? config.EDGE_AGENT_ID : !identity && config.BRANCH_ID ? (await gateway.register(config.BRANCH_ID, config.EDGE_AGENT_NAME, config.EDGE_AGENT_VERSION)).id : void 0;
  const resolvedAgentId = identity?.agentId ?? legacyAgentId;
  const resolvedBranchId = identity?.branchId ?? config.BRANCH_ID;
  if (!resolvedAgentId || !resolvedBranchId) throw new Error("edge_gateway_identity_unavailable");
  const agentId = resolvedAgentId;
  const branchId = resolvedBranchId;
  const authenticatedGateway = new GatewayClient(
    config.CONTROL_PLANE_URL,
    config.DEV_USER_ID,
    config.EDGE_BRIDGE_SHARED_KEY,
    config.CONTROL_PLANE_TIMEOUT_MS,
    outbox
  );
  if (identity) authenticatedGateway.useEdgeCredential(identity.credential);
  const control = authenticatedGateway;
  if (identity && config.EDGE_MANAGED_MEDIA_BOOTSTRAP) {
    try {
      const bootstrap = await control.getBootstrap(agentId);
      if (bootstrap.media) {
        identity.media = bootstrap.media;
        await identityStore.save(identity);
      }
    } catch (error) {
      logger.warn("Managed media bootstrap refresh failed; using the last encrypted configuration", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  if (config.EDGE_MANAGED_MEDIA_BOOTSTRAP && identity?.media) {
    Object.assign(config, {
      LIVE_MEDIA_ENABLED: true,
      MEDIA_RUNTIME_MANAGED: true,
      MEDIA_TUNNEL_MODE: "named",
      PUBLIC_MEDIA_GATEWAY_URL: identity.media.publicUrl,
      CLOUDFLARED_TUNNEL_TOKEN: identity.media.tunnelToken
    });
  }
  const credentialVault = new CameraCredentialVault(
    config.EDGE_CAMERA_CREDENTIAL_VAULT_PATH,
    config.EDGE_CAMERA_CREDENTIAL_VAULT_KEY_PATH
  );
  await credentialVault.load();
  if (hasArgument(argv, "--diagnose")) {
    await control.heartbeat(agentId, config.EDGE_AGENT_VERSION, config.PUBLIC_MEDIA_GATEWAY_URL);
    process.stdout.write(`Connected to ${config.CONTROL_PLANE_URL} as edge agent ${agentId}.
`);
    process.exit(0);
  }
  const secrets = new LocalStreamSecretStore(config.STREAM_SECRET_STORE_PATH);
  const networkCounterSampler = new NetworkCounterSampler();
  const networkPathTracker = new NetworkPathTracker(config.INTERNET_PATH_WINDOW_MS);
  const edgeResourceSampler = new EdgeResourceSampler();
  let edgeMediaRuntime;
  let lastRecorderProbeAt = 0;
  let lastRecorderArchiveScanAt = 0;
  const activeRecorders = new Map(
    config.RECORDERS_JSON.map((recorder) => [recorder.id, recorder])
  );
  await secrets.load();
  if (config.LIVE_MEDIA_ENABLED) {
    edgeMediaRuntime = await startEdgeMediaRuntime({ config, gateway: control, agentId, secrets });
  }
  const cameraHeartbeat = initializeCameraHeartbeat(
    config.CONTROL_PLANE_URL,
    branchId,
    agentId,
    config.DEV_USER_ID,
    config.FFPROBE_PATH,
    config.FFMPEG_PATH,
    identity?.credential ?? config.EDGE_BRIDGE_SHARED_KEY,
    (payload) => control.submitTelemetry(agentId, payload)
  );
  let lastCameraConfigSyncAt = 0;
  let lastDiscoveryAt = 0;
  await syncCameraHeartbeatConfig();
  if (config.AUTO_DISCOVERY_ENABLED) {
    await runAutomaticDiscovery();
  }
  cameraHeartbeat.start(config.CAMERA_HEARTBEAT_INTERVAL_MS);
  if (config.EDGE_MEDIA_SHARED_KEY) {
    await startSecretProvider({
      store: secrets,
      host: config.STREAM_SECRET_PROVIDER_HOST,
      port: config.STREAM_SECRET_PROVIDER_PORT,
      sharedKey: config.EDGE_MEDIA_SHARED_KEY
    });
    logger.info(`Local stream-secret provider listening on ${config.STREAM_SECRET_PROVIDER_HOST}:${config.STREAM_SECRET_PROVIDER_PORT}`);
  }
  logger.info(`Edge agent ${agentId} registered; waiting for branch commands`, { branchId, version: config.EDGE_AGENT_VERSION });
  await heartbeatAndReport();
  let stopping = false;
  process.once("SIGINT", () => {
    stopping = true;
  });
  process.once("SIGTERM", () => {
    stopping = true;
  });
  while (!stopping) {
    try {
      await heartbeatAndReport();
      const replay = await control.flushOutbox();
      if (replay.delivered > 0) logger.info("Replayed offline telemetry", replay);
      if (config.AUTO_DISCOVERY_ENABLED && Date.now() - lastDiscoveryAt >= config.AUTO_DISCOVERY_INTERVAL_MS) {
        await runAutomaticDiscovery();
      }
      const command = await control.claimCommand(agentId);
      if (command) {
        try {
          const outcome = await executeEdgeCommand(command.type, command.payload);
          await control.completeCommand(agentId, command.id, { status: "succeeded", result: outcome.result });
          if (outcome.restartAgent) {
            logger.info("Restarting edge agent after acknowledged remote command", { commandId: command.id });
            process.exit(75);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await control.completeCommand(agentId, command.id, { status: "failed", error: message.slice(0, 2e3) });
        }
      }
      const job = await control.claimScanJob(agentId, config.EDGE_AGENT_VERSION);
      if (job) {
        try {
          const resultCount = await scanBranch();
          await control.completeScanJob(agentId, job.id, {
            status: "completed",
            resultCount
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await control.completeScanJob(agentId, job.id, {
            status: "failed",
            resultCount: 0,
            error: message.slice(0, 2e3)
          });
        }
      }
    } catch (error) {
      logger.error("Edge command poll failed", { error: error instanceof Error ? error.message : String(error) });
    }
    await delay2(5e3);
  }
  cameraHeartbeat.stop();
  await edgeMediaRuntime?.stop();
  async function scanBranch() {
    const configuredEndpoints = config.ONVIF_ENDPOINTS.split(",").map((value) => value.trim()).filter(Boolean);
    const endpoints = configuredEndpoints.length > 0 ? configuredEndpoints.map((serviceUrl) => ({
      endpointReference: null,
      xaddrs: [serviceUrl],
      scopes: [],
      types: [],
      remoteAddress: new URL(serviceUrl).hostname
    })) : await discoverOnvifDevices(config.DISCOVERY_TIMEOUT_MS);
    logger.info(`Discovered ${endpoints.length} ONVIF endpoint(s)`);
    let submitted = 0;
    for (const endpoint of endpoints) {
      const serviceUrl = endpoint.xaddrs[0];
      if (!serviceUrl) continue;
      try {
        const credentials = credentialVault.get(endpoint.remoteAddress) ?? {
          username: config.CAMERA_USERNAME,
          password: config.CAMERA_PASSWORD,
          updatedAt: "configuration"
        };
        const client = new OnvifClient(serviceUrl, credentials, config.ONVIF_TIMEOUT_MS);
        const device = await client.inspect();
        const vendor = normalizeVendor(device.manufacturer);
        const discoveryKinds = [...endpoint.scopes, ...endpoint.types];
        if (looksLikeRecorder(device, discoveryKinds)) {
          const discoveredId = `recorder-${device.serialNumber || endpoint.remoteAddress}`.replace(/[^a-zA-Z0-9_.:-]/g, "-");
          const observedAt = (/* @__PURE__ */ new Date()).toISOString();
          const parsedServiceUrl2 = new URL(serviceUrl);
          const recorderVendor = recorderAdapterVendor(device.manufacturer);
          const recorderType = /dvr|xvr|uvr/i.test(`${device.model} ${discoveryKinds.join(" ")}`) ? "dvr" : "nvr";
          const channels = await discoverRecorderChannels({
            manufacturer: device.manufacturer,
            model: device.model,
            profiles: device.profiles,
            credentials,
            getStreamUri: (profileToken) => client.getStreamUri(device.mediaServiceUrl, profileToken),
            probeStream: (uri) => probeRtsp(uri, config.FFPROBE_PATH, config.ONVIF_TIMEOUT_MS)
          });
          activeRecorders.set(discoveredId, {
            id: discoveredId,
            name: `${device.manufacturer} ${device.model}`,
            deviceType: recorderType,
            vendor: recorderVendor,
            model: device.model,
            host: endpoint.remoteAddress,
            port: Number(parsedServiceUrl2.port || (parsedServiceUrl2.protocol === "https:" ? 443 : 80)),
            secure: parsedServiceUrl2.protocol === "https:",
            rtspPort: 554,
            username: credentials.username,
            password: credentials.password
          });
          await control.submitTelemetry(agentId, {
            branchId,
            edgeAgentId: agentId,
            deviceType: "recorder",
            deviceId: discoveredId,
            observedAt,
            source: "onvif",
            quality: "verified",
            idempotencyKey: `${agentId}:recorder-discovery:${discoveredId}:${observedAt}`,
            metrics: {
              name: `${device.manufacturer} ${device.model}`,
              deviceType: recorderType,
              vendor,
              model: device.model,
              serialNumber: device.serialNumber ?? "",
              firmwareVersion: device.firmwareVersion ?? "",
              ipAddress: endpoint.remoteAddress,
              protocol: "onvif",
              reachable: true,
              status: "online",
              totalCameras: channels.length || null,
              connectedCameras: channels.length ? channels.filter((channel) => channel.streamVerified).length : null,
              recordingStatus: "unknown"
            },
            reasonCodes: ["onvif_auto_discovered", "recorder_channels_enumerated", "recording_state_vendor_specific"]
          });
          submitted += 1;
          for (const channel of channels) {
            const channelDiscovery = await control.submitDiscovery(branchId, {
              edgeAgentId: agentId,
              discoveryMethod: "nvr-dvr-channel-discovery",
              vendor,
              manufacturer: device.manufacturer,
              model: `${device.model} channel`,
              ipAddress: endpoint.remoteAddress,
              firmwareVersion: device.firmwareVersion,
              displayName: channel.name === `Channel ${channel.sourceChannel}` ? `${device.manufacturer} ${device.model} - Channel ${channel.sourceChannel}` : channel.name,
              credentialsRequired: channel.reasonCodes.includes("recorder_channel_credentials_rejected"),
              streamVerified: channel.streamVerified,
              rtspValidated: channel.streamVerified,
              compatibility: channel.streamVerified ? "compatible" : "review-required",
              duplicateStatus: "unique",
              compatibilityStatus: channel.streamVerified ? "compatible" : "review-required",
              onvifSupport: true,
              onvifServices: device.services,
              onvifCapabilityTests: device.capabilityTests,
              onvifPort: Number(parsedServiceUrl2.port || (parsedServiceUrl2.protocol === "https:" ? 443 : 80)),
              rtspPort: 554,
              profiles: channel.profiles.map((profile) => ({
                name: profile.name,
                codec: profile.codec,
                width: Math.max(1, channel.probe?.width ?? profile.width),
                height: Math.max(1, channel.probe?.height ?? profile.height)
              })),
              capabilities: device.capabilities,
              statusReason: channel.reasonCodes.join(",").slice(0, 200),
              hardwareId: `${discoveredId}:channel:${channel.sourceChannel}`,
              existingDeviceAssociation: discoveredId,
              sourceType: channel.sourceType,
              recorderId: discoveredId,
              recorderChannel: channel.sourceChannel,
              ...device.serialNumber ? { recorderSerialNumber: device.serialNumber } : {}
            });
            if (channel.primaryStreamUri) {
              await secrets.set(`edge://${agentId}/${channelDiscovery.id}`, channel.primaryStreamUri);
            }
            submitted += 1;
          }
          logger.info(`Auto-provisioned recorder ${device.manufacturer} ${device.model} as ${discoveredId}`, {
            channels: channels.length,
            verifiedChannels: channels.filter((channel) => channel.streamVerified).length
          });
          continue;
        }
        const profiles = [];
        let primarySourceUri;
        for (const profile of device.profiles) {
          const uri = await client.getStreamUri(device.mediaServiceUrl, profile.token);
          const sourceUri = attachCredentials(uri, credentials);
          primarySourceUri ??= sourceUri;
          const result2 = await probeRtsp(sourceUri, config.FFPROBE_PATH);
          profiles.push({
            name: profile.name,
            codec: profile.codec,
            width: result2.width ?? profile.width,
            height: result2.height ?? profile.height
          });
        }
        const parsedServiceUrl = new URL(serviceUrl);
        const discovery = await control.submitDiscovery(branchId, {
          edgeAgentId: agentId,
          discoveryMethod: "onvif-ws-discovery",
          vendor,
          manufacturer: device.manufacturer,
          model: device.model,
          ipAddress: endpoint.remoteAddress,
          serialNumber: device.serialNumber,
          firmwareVersion: device.firmwareVersion,
          displayName: `${device.manufacturer} ${device.model}`,
          credentialsRequired: false,
          streamVerified: Boolean(primarySourceUri && profiles.length > 0),
          rtspValidated: Boolean(primarySourceUri && profiles.length > 0),
          compatibility: "compatible",
          duplicateStatus: "unique",
          compatibilityStatus: "compatible",
          onvifSupport: true,
          onvifServices: device.services,
          onvifCapabilityTests: device.capabilityTests,
          onvifPort: Number(parsedServiceUrl.port || (parsedServiceUrl.protocol === "https:" ? 443 : 80)),
          rtspPort: 554,
          profiles,
          capabilities: device.capabilities
        });
        if (primarySourceUri) {
          await secrets.set(`edge://${agentId}/${discovery.id}`, primarySourceUri);
        }
        submitted += 1;
        logger.info(`Submitted ${device.manufacturer} ${device.model} as discovery ${discovery.id}`, { compatibility: compatibilityNotes(vendor) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to inspect ${endpoint.remoteAddress}`, { error: message });
        try {
          const serviceUrl2 = endpoint.xaddrs[0];
          if (!serviceUrl2) continue;
          const parsedServiceUrl = new URL(serviceUrl2);
          await control.submitDiscovery(branchId, {
            edgeAgentId: agentId,
            discoveryMethod: "onvif-ws-discovery",
            vendor: "other",
            manufacturer: "ONVIF",
            model: `Camera ${endpoint.remoteAddress}`,
            displayName: `Camera ${endpoint.remoteAddress}`,
            ipAddress: endpoint.remoteAddress,
            onvifPort: Number(parsedServiceUrl.port || (parsedServiceUrl.protocol === "https:" ? 443 : 80)),
            rtspPort: 554,
            onvifSupport: true,
            credentialsRequired: /401|403|unauthori|forbidden|credential|auth/i.test(message),
            streamVerified: false,
            rtspValidated: false,
            compatibility: "review-required",
            duplicateStatus: "unique",
            compatibilityStatus: "review-required",
            statusReason: message.slice(0, 200),
            profiles: [{ name: "unverified", codec: "unknown", width: 1, height: 1 }],
            capabilities: { ptz: false, audio: false, events: false }
          });
          submitted += 1;
        } catch (submissionError) {
          logger.error(`Failed to report ${endpoint.remoteAddress}`, { error: submissionError instanceof Error ? submissionError.message : String(submissionError) });
        }
      }
    }
    return submitted;
  }
  async function runAutomaticDiscovery() {
    lastDiscoveryAt = Date.now();
    try {
      const discovered = await scanBranch();
      logger.info("Automatic ONVIF discovery completed", { discovered });
    } catch (error) {
      logger.error("Automatic ONVIF discovery failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  function delay2(milliseconds) {
    return new Promise((resolve3) => setTimeout(resolve3, milliseconds));
  }
  async function heartbeatAndReport() {
    const startedAt = Date.now();
    await control.heartbeat(agentId, config.EDGE_AGENT_VERSION, edgeMediaRuntime?.publicUrl ?? config.PUBLIC_MEDIA_GATEWAY_URL);
    if (Date.now() - lastCameraConfigSyncAt >= config.CAMERA_CONFIG_REFRESH_MS) {
      await syncCameraHeartbeatConfig().catch((error) => {
        logger.error("Camera monitoring configuration refresh failed", { error: error instanceof Error ? error.message : String(error) });
      });
    }
    const observedAt = (/* @__PURE__ */ new Date()).toISOString();
    const latencyMs = Date.now() - startedAt;
    const { reasonCodes: edgeResourceReasonCodes, ...edgeResourceMetrics } = await edgeResourceSampler.sample(config.EDGE_HEALTH_DISK_PATH);
    const configuredLinks = config.INTERNET_LINKS_JSON.length ? config.INTERNET_LINKS_JSON : [{
      id: "primary",
      role: "primary",
      ispName: "Primary ISP",
      targets: [config.CONTROL_PLANE_URL]
    }];
    const linkResults = await Promise.all(configuredLinks.map((link) => probeInternetLink(link, {
      timeoutMs: config.INTERNET_PROBE_TIMEOUT_MS,
      attempts: config.INTERNET_PROBE_ATTEMPTS,
      counterSampler: networkCounterSampler,
      pathTracker: networkPathTracker
    })));
    const primaryAvailable = linkResults.some((link) => link.role === "primary" && link.connectivity);
    const scanRecorderArchives = Date.now() - lastRecorderArchiveScanAt >= config.RECORDER_ARCHIVE_SCAN_INTERVAL_MS;
    const recorderReports = Date.now() - lastRecorderProbeAt >= config.RECORDER_POLL_INTERVAL_MS ? await collectRecorderReports(observedAt, scanRecorderArchives) : [];
    if (recorderReports.length) lastRecorderProbeAt = Date.now();
    if (scanRecorderArchives && recorderReports.length) lastRecorderArchiveScanAt = Date.now();
    await Promise.all([
      control.submitTelemetry(agentId, {
        branchId,
        edgeAgentId: agentId,
        deviceType: "edge-agent",
        deviceId: agentId,
        observedAt,
        source: "system",
        quality: "verified",
        idempotencyKey: `${agentId}:edge-agent:${observedAt}`,
        metrics: {
          status: "online",
          version: config.EDGE_AGENT_VERSION,
          uptimeSeconds: Math.round((0, import_node_os2.uptime)()),
          liveMediaEnabled: config.LIVE_MEDIA_ENABLED,
          mediaRuntimeReady: Boolean(edgeMediaRuntime),
          mediaTunnelMode: config.MEDIA_TUNNEL_MODE,
          publicMediaUrl: edgeMediaRuntime?.publicUrl ?? config.PUBLIC_MEDIA_GATEWAY_URL ?? null,
          ...edgeResourceMetrics
        },
        reasonCodes: edgeResourceReasonCodes
      }),
      ...linkResults.map((link) => {
        const { reasonCodes, ...linkMetrics } = link;
        return control.submitTelemetry(agentId, {
          branchId,
          edgeAgentId: agentId,
          deviceType: "network",
          deviceId: `${branchId}:internet:${link.linkId}`,
          observedAt,
          source: "system",
          quality: "verified",
          idempotencyKey: `${agentId}:network:${link.linkId}:${observedAt}`,
          metrics: {
            ...linkMetrics,
            active: link.role === "primary" ? primaryAvailable : !primaryAvailable && link.connectivity,
            controlPlaneLatencyMs: latencyMs,
            lastOnlineAt: link.connectivity ? observedAt : null
          },
          reasonCodes
        });
      }),
      ...recorderReports.flatMap(({ recorder, probe }) => {
        const source = recorder.vendor === "cp-plus" ? "cp-plus-adapter" : recorder.vendor === "onvif" ? "onvif" : "system";
        const submissions = [control.submitTelemetry(agentId, {
          branchId,
          edgeAgentId: agentId,
          deviceType: "recorder",
          deviceId: recorder.id,
          observedAt,
          source,
          quality: "verified",
          idempotencyKey: `${agentId}:recorder:${recorder.id}:${observedAt}`,
          metrics: probe.metrics,
          reasonCodes: probe.reasonCodes
        })];
        submissions.push(...probe.channelHealth.map((channel) => control.submitTelemetry(agentId, {
          branchId,
          edgeAgentId: agentId,
          deviceType: "recorder-channel",
          deviceId: `${recorder.id}:channel:${channel.sourceChannel}`,
          observedAt,
          source,
          quality: channel.status === "unknown" ? "unavailable" : "verified",
          idempotencyKey: `${agentId}:recorder-channel:${recorder.id}:${channel.sourceChannel}:${observedAt}`,
          metrics: {
            recorderId: recorder.id,
            sourceChannel: channel.sourceChannel,
            status: channel.status,
            connected: channel.connected,
            lastRecordedAt: channel.lastRecordedAt,
            recordingStatusSource: channel.recordingStatusSource
          },
          reasonCodes: channel.reasonCodes
        })));
        if (probe.hddStatus.length) submissions.push(control.submitRecorderHdd(agentId, {
          branchId,
          recorderId: recorder.id,
          observedAt,
          source,
          quality: "verified",
          idempotencyKey: `${agentId}:recorder-hdd:${recorder.id}:${observedAt}`,
          hddStatus: probe.hddStatus
        }));
        if (probe.archiveEvidence.length) submissions.push(control.submitRecorderArchive(agentId, {
          branchId,
          recorderId: recorder.id,
          observedAt,
          source,
          quality: "verified",
          idempotencyKey: `${agentId}:recorder-archive:${recorder.id}:${observedAt}`,
          entries: probe.archiveEvidence
        }));
        return submissions;
      })
    ]);
  }
  async function syncCameraHeartbeatConfig() {
    const cameras = await control.listMonitoringCameras(agentId, config.EDGE_AGENT_VERSION);
    cameraHeartbeat.replaceCameras(cameras.map((camera) => {
      const rtspUrl = secrets.get(camera.connectionSecretRef);
      return {
        id: camera.id,
        name: camera.name,
        ...rtspUrl ? { rtspUrl } : {},
        enabled: true
      };
    }));
    const channelsByRecorder = /* @__PURE__ */ new Map();
    for (const camera of cameras) {
      if (!camera.recorderId || !camera.recorderChannel) continue;
      const channels = channelsByRecorder.get(camera.recorderId) ?? [];
      channels.push({ cameraId: camera.id, channel: camera.recorderChannel });
      channelsByRecorder.set(camera.recorderId, channels);
    }
    for (const [recorderId, channels] of channelsByRecorder) {
      const recorder = activeRecorders.get(recorderId);
      if (!recorder) continue;
      recorder.archiveRetention = recorder.archiveRetention ?? {
        lookbackDays: 1,
        maxResults: 1e3,
        continuityGapSeconds: 300,
        verifyPlayback: true,
        channels
      };
      recorder.archiveRetention.channels = channels;
    }
    lastCameraConfigSyncAt = Date.now();
  }
  async function collectRecorderReports(observedAt, includeArchive) {
    return Promise.all([...activeRecorders.values()].map(async (recorder) => {
      const secureCredential = credentialVault.get(recorder.host);
      const resolvedRecorder = secureCredential ? { ...recorder, username: secureCredential.username, password: secureCredential.password } : recorder;
      const probe = await probeRecorder(resolvedRecorder, config.RECORDER_PROBE_TIMEOUT_MS, { includeArchive });
      if (includeArchive && resolvedRecorder.archiveRetention?.verifyPlayback !== false) {
        for (const evidence of probe.archiveEvidence) {
          if (evidence.status !== "available" || !evidence.newestPlayableAt) continue;
          const uri = recorderPlaybackUri(resolvedRecorder, evidence.sourceChannel, evidence.newestPlayableAt);
          if (!uri) {
            evidence.reasonCodes.push("playback_probe_not_supported");
            continue;
          }
          const playback = await probeRtsp(uri, config.FFPROBE_PATH, config.RECORDER_PROBE_TIMEOUT_MS);
          evidence.playbackVerified = playback.reachable;
          evidence.playbackCodec = playback.codec;
          if (playback.reachable) evidence.reasonCodes.push("latest_clip_playback_verified");
          else {
            evidence.playbackError = playback.error?.slice(0, 300) ?? "playback_failed";
            evidence.reasonCodes.push("latest_clip_playback_failed");
          }
        }
      }
      return { recorder: resolvedRecorder, observedAt, probe };
    }));
  }
  async function executeEdgeCommand(type, payload) {
    switch (type) {
      case "rediscover":
        return { result: { discovered: await scanBranch() } };
      case "restart-media":
        if (!config.LIVE_MEDIA_ENABLED) throw new Error("live_media_disabled");
        await edgeMediaRuntime?.stop();
        edgeMediaRuntime = await startEdgeMediaRuntime({ config, gateway: control, agentId, secrets });
        return { result: { status: "restarted", publicUrl: edgeMediaRuntime.publicUrl } };
      case "restart-agent":
        return { result: { status: "restart_acknowledged" }, restartAgent: true };
      case "probe-camera": {
        const cameraId = typeof payload.cameraId === "string" ? payload.cameraId : "";
        if (!cameraId) throw new Error("cameraId_required");
        const camera = (await control.listMonitoringCameras(agentId, config.EDGE_AGENT_VERSION)).find((item) => item.id === cameraId);
        const source = camera ? secrets.get(camera.connectionSecretRef) : void 0;
        if (!source) throw new Error("camera_stream_secret_unavailable");
        const probe = await probeRtsp(source, config.FFPROBE_PATH, config.ONVIF_TIMEOUT_MS);
        return { result: { cameraId, ...probe } };
      }
      case "probe-recorder": {
        const recorderId = typeof payload.recorderId === "string" ? payload.recorderId : "";
        const recorder = activeRecorders.get(recorderId);
        if (!recorder) throw new Error("recorder_not_configured");
        const probe = await probeRecorder(recorder, config.RECORDER_PROBE_TIMEOUT_MS, { includeArchive: true });
        return { result: {
          recorderId,
          metrics: probe.metrics,
          reasonCodes: probe.reasonCodes,
          hddCount: probe.hddStatus.length,
          channelHealth: probe.channelHealth,
          archiveEvidence: probe.archiveEvidence
        } };
      }
      case "collect-logs": {
        const data = await (0, import_promises9.readFile)(config.EDGE_LOG_PATH, "utf8").catch(() => "");
        const tail = redactDiagnosticText(data.slice(-64 * 1024));
        return { result: { collectedAt: (/* @__PURE__ */ new Date()).toISOString(), bytes: Buffer.byteLength(tail), tail } };
      }
      case "update-credentials": {
        if (!identity?.commandPrivateKey) throw new Error("gateway_secure_command_key_unavailable");
        const envelope = payload.envelope;
        if (!envelope || typeof envelope !== "object") throw new Error("credential_envelope_required");
        const decrypted = openSealedCommand(envelope, identity.commandPrivateKey);
        if (typeof decrypted.username !== "string" || !decrypted.username || typeof decrypted.password !== "string" || !decrypted.scope || decrypted.scope.host !== void 0 && typeof decrypted.scope.host !== "string") {
          throw new Error("invalid_camera_credential_payload");
        }
        const saved = await credentialVault.set({
          username: decrypted.username,
          password: decrypted.password,
          ...typeof decrypted.scope.host === "string" ? { host: decrypted.scope.host } : {}
        });
        const discovered = await scanBranch();
        return { result: { ...saved, rediscovered: discovered } };
      }
      case "apply-update": {
        const release = await control.getUpdate(agentId, config.EDGE_AGENT_VERSION);
        if (!release) throw new Error("no_update_assigned");
        const publicKey = identity?.updatePublicKey ?? config.EDGE_UPDATE_PUBLIC_KEY;
        if (!publicKey) throw new Error("edge_update_public_key_unavailable");
        const staged = await stageSignedUpdate(release, publicKey, config.EDGE_UPDATE_STAGING_PATH);
        return { result: { ...staged, status: "verified_and_staged", supervisorActivationRequired: true } };
      }
      default:
        throw new Error("unsupported_edge_command");
    }
  }
  function redactDiagnosticText(value) {
    return value.replace(/(rtsp:\/\/)[^@\s]+@/gi, "$1[redacted]@").replace(/(password|secret|token|credential|authorization)["'=:\s]+[^\s,}"']+/gi, "$1=[redacted]");
  }
  function prepareRuntimeOrExit(input) {
    try {
      return prepareEdgeRuntime(input);
    } catch (error) {
      process.stderr.write(`Edge agent startup failed: ${error instanceof Error ? error.message : String(error)}
`);
      process.exit(2);
    }
  }
  function loadConfigOrExit() {
    try {
      return loadEdgeConfig();
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      logger.error("Configuration is invalid", { configPath: runtime.configPath, error: details });
      process.stderr.write(`Edge-agent configuration is invalid (${runtime.configPath ?? "no configuration file found"}).
${details}
`);
      process.exit(2);
    }
  }
}
void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error("Edge agent stopped after an unrecoverable startup error", { error: message });
  process.stderr.write(`Edge agent failed to start: ${message}
`);
  process.exitCode = 1;
});
