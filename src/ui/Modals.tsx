import LoginModal from "../javadoc/api/LoginModal";
import JavadocModal from "../javadoc/JavadocModal";
import AboutModal from "./AboutModal";
import IndexProgressNotification from "./IndexProgressNotification";
import InheritanceModal from "./inheritance/InheritanceModal";
import { JarDecompilerModal, JarDecompilerProgressModal } from "./JarDecompilerModal";
import ProgressModal from "./ProgressModal";
import SettingsModal from "./SettingsModal";
import StructureModal from "./StructureModal";

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
