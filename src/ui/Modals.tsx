import LoginModal from "../javadoc/api/LoginModal";
import JavadocModal from "../javadoc/JavadocModal";
import InheritanceModal from "./inheritance/InheritanceModal";
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
            <JavadocModal />
            <LoginModal />
            <InheritanceModal />
            <AboutModal />
            <SettingsModal />
            <StructureModal />
            <JarDecompilerModal />
            <JarDecompilerProgressModal />
        </>
    );
};

export default Modals;
