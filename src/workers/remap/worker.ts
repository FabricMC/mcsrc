import * as Comlink from "comlink";
import { JarIndexer } from "../jar-index/types";

Comlink.expose(new JarIndexer());