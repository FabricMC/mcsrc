import JavadocModal from "../javadoc/JavadocModal";
import ProgressModal from "./ProgressModal";
import AboutModal from "./AboutModal";
import SettingsModal from "./SettingsModal";
import StructureModal from "./StructureModal";
import { JarDecompilerModal, JarDecompilerProgressModal } from "./JarDecompilerModal";
import IndexProgressNotification from "./IndexProgressNotification";
import LauncherMetaModal from "./meta/LauncherMetaModal";

const Modals = () => {
    return (
        <>
            <IndexProgressNotification />
            <ProgressModal />
            <JavadocModal />
            <AboutModal />
            <SettingsModal />
            <LauncherMetaModal />
            <StructureModal />
            <JarDecompilerModal />
            <JarDecompilerProgressModal />
        </>
    );
};

export default Modals;
