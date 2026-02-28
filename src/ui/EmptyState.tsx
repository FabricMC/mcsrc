import React from "react";
import { GithubOutlined, SearchOutlined, LinkOutlined, BranchesOutlined, CopyOutlined, CodeOutlined, FileSearchOutlined, AimOutlined } from '@ant-design/icons';
import { Card, Typography, Space, Tooltip } from 'antd';
import { classesList } from "../logic/JarFile";
import { openTab } from "../logic/Tabs";
import { useObservable } from "../utils/UseObservable";

const { Title, Paragraph } = Typography;

export const EmptyState = () => {
    const outerClasses = useObservable(classesList);

    const openRandomClass = () => {
        if (outerClasses && outerClasses.length > 0) {
            const filteredClasses = outerClasses.filter(cls => !cls.endsWith('package-info.class'));
            if (filteredClasses.length > 0) {
                const randomIndex = Math.floor(Math.random() * filteredClasses.length);
                openTab(filteredClasses[randomIndex]);
            }
        }
    };

    const features = [
        {
            icon: <LinkOutlined style={{ fontSize: "18px", color: "#722ed1" }} />,
            title: "Version Comparison",
            description: "Selecte \"Compare\" in the version selection dropdown to compare two versions side by side and see what changed"
        },
        {
            icon: <BranchesOutlined style={{ fontSize: "18px", color: "#eb2f96" }} />,
            title: "Inheritance Visualization",
            description: "Right-click anywhere in the class view and select 'Show Inheritance Hierarchy' to see a visual graph of the class's inheritance tree"
        },
        {
            icon: <SearchOutlined style={{ fontSize: "18px", color: "#52c41a" }} />,
            title: "Find References",
            description: "Right-click on any declaration and select 'Find References' to see a list of all places that reference that class, method, or field"
        },
        {
            icon: <AimOutlined style={{ fontSize: "18px", color: "#1890ff" }} />,
            title: "Go to Declaration",
            description: "Ctrl/Cmd + Click or right click and select 'Go to Declaration' on any class, method, or field to jump to its declaration site"
        },
        {
            icon: <CopyOutlined style={{ fontSize: "18px", color: "#faad14" }} />,
            title: "Mixin / Class Tweaker String",
            description: "Right-click on any class, method, or field and select 'Copy Mixin Target' or 'Copy Class Tweaker Target' to copy a string you can use in your mixin or class tweaker configs"
        },
        {
            icon: <CodeOutlined style={{ fontSize: "18px", color: "#f5222d" }} />,
            title: "Bytecode View",
            description: "In the settings menu enable \"Show Bytecode\" to see the java bytecode for the current class"
        }
    ];

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                height: "100%",
                color: "#d9d9d9",
                padding: "3rem 2rem",
                overflowY: "auto"
            }}
        >
            <Space direction="vertical" size="large" align="center" style={{ width: "100%" }}>
                <img
                    src="/assets/mcsrc_favicon.svg"
                    alt="mcsrc logo"
                    style={{
                        width: "120px",
                        height: "120px"
                    }}
                />

                <Paragraph style={{
                    fontSize: "18px",
                    marginBottom: 0,
                    color: "#d9d9d9",
                    textAlign: "center",
                    fontWeight: "500",
                    maxWidth: "700px"
                }}>
                    mcsrc.dev is a browser-based tool for viewing decompiled Minecraft Java Edition source code
                </Paragraph>

                <Paragraph style={{
                    fontSize: "14px",
                    marginBottom: 0,
                    color: "#8c8c8c",
                    textAlign: "center"
                }}>
                    Select a file from the tree on the left to get started, or{" "}
                    <a
                        onClick={openRandomClass}
                        style={{
                            color: "#1890ff",
                            cursor: "pointer",
                            textDecoration: "underline"
                        }}
                    >
                        open a random class
                    </a>
                </Paragraph>

                <div style={{ width: "100%", maxWidth: "700px" }}>
                    <Card
                        style={{
                            background: "#0d1117",
                            border: "1px solid #30363d",
                            marginBottom: "24px"
                        }}
                        bodyStyle={{ padding: "1.5rem" }}
                    >
                        <Title level={4} style={{
                            marginTop: 0,
                            marginBottom: "1rem",
                            color: "#fff"
                        }}>
                            How It Works
                        </Title>
                        <ul style={{
                            margin: 0,
                            paddingLeft: "1.5rem",
                            color: "#8c8c8c",
                            lineHeight: "1.8"
                        }}>
                            <li>The Minecraft jar is downloaded directly from Mojang's servers to your device when you use this tool.</li>
                            <li>Decompilation happens entirely in your browser</li>
                            <li>No Minecraft code or bytecode is redistributed by this website</li>
                            <li>Powered by the <a href="https://github.com/Vineflower/vineflower" target="_blank" rel="noreferrer" style={{ color: "#1890ff" }}>Vineflower</a> decompiler via the <a href="https://www.npmjs.com/package/@run-slicer/vf" target="_blank" rel="noreferrer" style={{ color: "#1890ff" }}>@run-slicer/vf</a> project</li>
                        </ul>
                    </Card>

                    <div>
                        <Title level={4} style={{
                            marginTop: 0,
                            marginBottom: "1rem",
                            color: "#fff"
                        }}>
                            Features
                        </Title>
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "0.75rem",
                            margin: 0
                        }}>
                            {features.map((feature, index) => (
                                <Tooltip key={index} title={feature.description} placement="top">
                                    <div style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.5rem",
                                        cursor: "help",
                                        padding: "0.5rem",
                                        borderRadius: "4px",
                                        transition: "background 0.2s",
                                        color: "#d9d9d9"
                                    }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = "#161b22";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = "transparent";
                                        }}>
                                        {feature.icon}
                                        <span>
                                            {feature.title}
                                        </span>
                                    </div>
                                </Tooltip>
                            ))}
                        </div>
                    </div>
                </div>

                <a
                    href="https://github.com/FabricMC/mcsrc"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                        color: "#fff",
                        textDecoration: "none",
                        padding: "0.75rem 1.5rem",
                        background: "#21262d",
                        border: "1px solid #30363d",
                        borderRadius: "6px",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        transition: "all 0.2s",
                        marginTop: "24px"
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#30363d";
                        e.currentTarget.style.borderColor = "#8b949e";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#21262d";
                        e.currentTarget.style.borderColor = "#30363d";
                    }}
                >
                    <GithubOutlined style={{ fontSize: "20px" }} />
                    Fork on GitHub
                </a>
            </Space>
        </div>
    );
};
