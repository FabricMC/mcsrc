import JavadocModal from "../javadoc/JavadocModal";
import { ENABLE_JAVADOC_EDITOR } from "../javadoc/JavadocConfig";
import ProgressModal from "./ProgressModal";
import AboutModal from "./AboutModal";
import SettingsModal from "./SettingsModal";
import StructureModal from "./StructureModal";
import { JarDecompilerModal, JarDecompilerProgressModal } from "./JarDecompilerModal";
import IndexProgressNotification from "./IndexProgressNotification";

const Modals = () => {
    return (
        <>
            <IndexProgressNotification />
            <ProgressModal />
            {ENABLE_JAVADOC_EDITOR && <JavadocModal />}
            <AboutModal />
            <SettingsModal />
            <StructureModal />
            <JarDecompilerModal />
            <JarDecompilerProgressModal />
        </>
    );
};

export default Modals;
