import { Flex, Progress } from "antd";
import { useObservable } from "../utils/UseObservable";
import { distinctUntilChanged, map } from "rxjs";
import { indexProgress } from "../workers/JarIndex";
import type { ReactNode } from "react";
import type React from "react";

const distinctJarIndexProgress = indexProgress.pipe(
    map(Math.round),
    distinctUntilChanged()
);

type IndexProgressProps = { children: ReactNode; };
const IndexProgress: React.FC<IndexProgressProps> = ({ children }) => {
    const progress = useObservable(distinctJarIndexProgress) ?? -1;
    const isOpen = progress >= 0;

    return (
        <div style={{ position: "relative" }}>
            {children}
            {isOpen && <Flex
                vertical
                style={{
                    position: "absolute",
                    boxSizing: "border-box",
                    top: 0, left: 0,
                    width: "100%",
                    padding: "16px",
                }}
            >
                <span>Indexing Minecraft Jar...</span>
                <Progress percent={progress} />
            </Flex>}
        </div>
    );
};

export default IndexProgress;
