import * as Comlink from "comlink";
import { JarIndexer } from "./types";

Comlink.expose(new JarIndexer());
