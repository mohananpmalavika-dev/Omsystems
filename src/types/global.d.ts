declare module 'express' {
  export function Router(): any;
  export interface Request {
    body?: any;
    params?: Record<string, any>;
    query?: Record<string, any>;
    [key: string]: any;
  }
  export interface Response {
    json(body: any): any;
    status(code: number): Response;
    send(body: any): any;
    [key: string]: any;
  }
  const express: any;
  export default express;
}

declare module 'axios' {
  const axios: any;
  export default axios;
}

declare module 'node-forge' {
  const forge: any;
  export = forge;
}

declare module 'node-forge/*' {
  const forge: any;
  export default forge;
}
