import { BehaviorSubject, map, Observable } from "rxjs";

import type { Token } from "../logic/Tokens";

import { selectedMinecraftVersion } from "../logic/State";
import { javadocApi } from "./api/JavadocApi";

export type JavadocString = string;

export interface JavadocData {
  classes: Record<
    string,
    {
      javadoc: JavadocString | null;
      methods: Record<string, JavadocString>;
      fields: Record<string, JavadocString>;
    }
  >;
}

export const javadocData = new BehaviorSubject<JavadocData>({
  classes: {},
});

// Holds the currently active token for which Javadoc is being edited
export const activeJavadocToken = new BehaviorSubject<Token | null>(null);

export function setTokenJavadoc(token: Token, javadoc: JavadocString | undefined) {
  const data = javadocData.getValue();
  const classEntry = data.classes[token.className] || { javadoc: null, methods: {}, fields: {} };

  if (token.type === "class") {
    classEntry.javadoc = javadoc ?? null;
  } else if (token.type === "method") {
    if (javadoc === undefined) {
      delete classEntry.methods[token.name + token.descriptor];
    } else {
      classEntry.methods[token.name + token.descriptor] = javadoc;
    }
  } else if (token.type === "field") {
    if (javadoc === undefined) {
      delete classEntry.fields[token.name + token.descriptor];
    } else {
      classEntry.fields[token.name + token.descriptor] = javadoc;
    }
  }

  data.classes[token.className] = classEntry;
  javadocData.next(data);
  console.log("Updated Javadoc data:", data);
}

// Refreshes the Javadoc data for a specific class from the server
export async function refreshJavadocDataForClass(className: string) {
  const minecraftVersion = selectedMinecraftVersion.value;
  if (!minecraftVersion) {
    throw new Error("No Minecraft version selected");
  }

  const data = await javadocApi.getJavadoc(minecraftVersion, className);

  for (const [key, entry] of Object.entries(data.data)) {
    const classEntry = javadocData.getValue().classes[key] || {
      javadoc: null,
      methods: {},
      fields: {},
    };
    classEntry.javadoc = entry.value || null;
    classEntry.methods = entry.methods || {};
    classEntry.fields = entry.fields || {};
    const nextData = { ...javadocData.getValue() };
    nextData.classes[key] = classEntry;
    javadocData.next(nextData);
  }
}

export function observeJavadocForToken(token: Token): Observable<JavadocString | null> {
  return javadocData.pipe(
    map((data) => {
      return getJavadocForToken(token, data);
    }),
  );
}

export function getJavadocForToken(token: Token, javadoc: JavadocData): JavadocString | null {
  switch (token.type) {
    case "class":
      return javadoc.classes[token.className]?.javadoc || null;
    case "method":
      return javadoc.classes[token.className]?.methods[token.name + token.descriptor] || null;
    case "field":
      return javadoc.classes[token.className]?.fields[token.name + token.descriptor] || null;
  }

  return null;
}
