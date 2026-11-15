import ProgressModal from "./ProgressModal";
import AboutModal from "./AboutModal";
import SettingsModal from "./settings/SettingsModal";
import StructureModal from "./StructureModal";
import { JarDecompilerModal, JarDecompilerProgressModal } from "./JarDecompilerModal";
import IndexProgressNotification from "./IndexProgressNotification";
import AnnotaterServerNotification from "./AnnotaterServerNotification";
import LauncherMetaModal from "./meta/LauncherMetaModal";

const Modals = () => {
    return (
        <>
            <IndexProgressNotification />
            <AnnotaterServerNotification />
            <ProgressModal />
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
