import * as Comlink from "comlink";
import { JarIndexWorker } from "./JarIndexWorker";

Comlink.expose(new JarIndexWorker());
