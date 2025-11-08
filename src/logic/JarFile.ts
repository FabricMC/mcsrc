import { map } from 'rxjs';
import { minecraftJar } from './MinecraftApi';

export const fileList = minecraftJar.pipe(
    map(jar => Object.keys(jar.files))
);

// File list that only contains outer class files
export const classesList = fileList.pipe(
    map(files => files.filter(file => file.endsWith('.class') && !file.includes('$')))
);
