/** Comprehensive type declarations for net-snmp */
declare module "net-snmp" {
  export type Version = any;
  export type Session = any;
  export type VarBind = any;
  export type Varbind = any;
  export type SessionOptions = any;
  export type TrapReceiver = any;
  export type ResponseError = any;

  export const Version1: any;
  export const Version2c: any;
  export const Version3: any;
  export const AuthProtocols: any;
  export const PrivProtocols: any;
  export const ErrorStatus: any;
  export const ObjectType: any;

  export function createSession(...args: any[]): any;
  export function createV3Session(...args: any[]): any;
  export function isVarbindError(...args: any[]): boolean;
  export function isVersion1(...args: any[]): boolean;
  export function isVersion2c(...args: any[]): boolean;

  const _default: any;
  export default _default;
}
