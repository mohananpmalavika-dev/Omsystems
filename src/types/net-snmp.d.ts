/** Minimal declaration for net-snmp's CommonJS API.  The upstream package does
 * not publish TypeScript declarations; wrapper code keeps its untyped surface
 * contained inside the infrastructure collector. */
declare module "net-snmp" {
  const snmp: any;
  export = snmp;
}
