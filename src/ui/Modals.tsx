import LoginModal from "../javadoc/api/LoginModal";
import JavadocModal from "../javadoc/JavadocModal";
import ProgressModal from "./ProgressModal";
import AboutModal from "./AboutModal";
import SettingsModal from "./SettingsModal";
import StructureModal from "./StructureModal";
import { JarDecompilerModal, JarDecompilerProgressModal } from "./JarDecompilerModal";
import IndexProgressNotification from "./IndexProgressNotification";
import FullTextSearchModal from "./FullTextSearchModal";

const Modals = () => {
    return (
        <>
            <IndexProgressNotification />
            <ProgressModal />
            <JavadocModal />
            <LoginModal />
            <AboutModal />
            <SettingsModal />
            <StructureModal />
            <JarDecompilerModal />
            <JarDecompilerProgressModal />
            <FullTextSearchModal />
        </>
    );
};

export default Modals;
