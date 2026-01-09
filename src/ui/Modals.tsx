import LoginModal from "../javadoc/api/LoginModal";
import JavadocModal from "../javadoc/JavadocModal";
import IndexProgressModal from "./IndexProgressModal";
import InheritanceModal from "./InheritanceModal";
import ProgressModal from "./ProgressModal";

const Modals = () => {
    return (
        <>
            <ProgressModal />
            <IndexProgressModal />
            <JavadocModal />
            <LoginModal />
            <InheritanceModal />
        </>
    );
};

export default Modals;