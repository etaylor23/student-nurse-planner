declare module "dynalite" {
  import type { Server } from "http";
  interface DynaliteOptions {
    createTableMs?: number;
    deleteTableMs?: number;
    updateTableMs?: number;
    path?: string;
    ssl?: boolean;
  }
  export default function dynalite(options?: DynaliteOptions): Server;
}
