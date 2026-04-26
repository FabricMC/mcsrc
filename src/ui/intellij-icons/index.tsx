import Icon from '@ant-design/icons';
import type React from 'react';
import type { SVGProps } from 'react';
import type { ClassData } from '../../workers/jar-index/client';
import type { CustomIconComponentProps } from '@ant-design/icons/lib/components/Icon';
import { useObservable } from '../../utils/UseObservable';
import { isDarkMode } from '../../logic/Browser';

import AnnotationDarkSvg from './annotation_dark.svg?react';
import ClassAbstractDarkSvg from './classAbstract_dark.svg?react';
import ClassDarkSvg from './class_dark.svg?react';
import EnumDarkSvg from './enum_dark.svg?react';
import ExceptionDarkSvg from './exception_dark.svg?react';
import FinalMarkDarkSvg from './finalMark_dark.svg?react';
import InterfaceDarkSvg from './interface_dark.svg?react';
import JavaDarkSvg from './java_dark.svg?react';
import RecordDarkSvg from './record_dark.svg?react';
import PackageDarkSvg from './package_dark.svg?react';
import HierarchyDarkSvg from './hierarchy_dark.svg?react';

import AnnotationSvg from './annotation.svg?react';
import ClassAbstractSvg from './classAbstract.svg?react';
import ClassSvg from './class.svg?react';
import EnumSvg from './enum.svg?react';
import ExceptionSvg from './exception.svg?react';
import FinalMarkSvg from './finalMark.svg?react';
import InterfaceSvg from './interface.svg?react';
import JavaSvg from './java.svg?react';
import RecordSvg from './record.svg?react';
import PackageSvg from './package.svg?react';
import HierarchySvg from './hierarchy.svg?react';

type SVGFC = React.FC<SVGProps<SVGSVGElement>>;
const stack = (...svgs: SVGFC[]): SVGFC => (props) => (
    <div style={{ position: 'relative', width: props.width, height: props.height }}>
        {svgs.map((Svg, i) =>
            <Svg {...props} key={i}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    ...props.style
                }}
            />
        )}
    </div>
);

const ClassFinalDarkSvg = stack(ClassDarkSvg, FinalMarkDarkSvg);
const ClassFinalSvg = stack(ClassSvg, FinalMarkSvg);

type IconProps = Partial<CustomIconComponentProps>;
type IconFC = React.FC<IconProps>;

const icon = (lightFc: SVGFC, darkFc: SVGFC): IconFC => (props) => {
    const dark = useObservable(isDarkMode);
    return <Icon component={dark ? darkFc : lightFc} {...props} />;
};

export const AnnotationIcon = icon(AnnotationSvg, AnnotationDarkSvg);
export const ClassAbstractIcon = icon(ClassAbstractSvg, ClassAbstractDarkSvg);
export const ClassIcon = icon(ClassSvg, ClassDarkSvg);
export const ClassFinalIcon = icon(ClassFinalSvg, ClassFinalDarkSvg);
export const EnumIcon = icon(EnumSvg, EnumDarkSvg);
export const ExceptionIcon = icon(ExceptionSvg, ExceptionDarkSvg);
export const FinalMarkIcon = icon(FinalMarkSvg, FinalMarkDarkSvg);
export const InterfaceIcon = icon(InterfaceSvg, InterfaceDarkSvg);
export const JavaIcon = icon(JavaSvg, JavaDarkSvg);
export const RecordIcon = icon(RecordSvg, RecordDarkSvg);
export const PackageIcon = icon(PackageSvg, PackageDarkSvg);
export const HierarchyIcon = icon(HierarchySvg, HierarchyDarkSvg);

// https://asm.ow2.io/javadoc/org/objectweb/asm/Opcodes.html
// https://asm.ow2.io/javadoc/constant-values.html
const ACC_INTERFACE = 512;
const ACC_ENUM = 16384;
const ACC_ANNOTATION = 8192;
const ACC_RECORD = 65536;
const ACC_ABSTRACT = 1024;
const ACC_FINAL = 16;

export type ClassDataIconProps = IconProps & { data: ClassData; };
export const ClassDataIcon: React.FC<ClassDataIconProps> = (p) => {
    const { className, accessFlags, superName } = p.data;

    // oxlint-disable-next-line no-constant-binary-expression
    if (false
        || /^(.*\/)?package-info$/.test(className)
        || /^(.*\/)?module-info$/.test(className)) return <JavaIcon {...p} />;

    if ((accessFlags & ACC_ANNOTATION) !== 0) return <AnnotationIcon {...p} />;
    if ((accessFlags & ACC_INTERFACE) !== 0) return <InterfaceIcon {...p} />;
    if ((accessFlags & ACC_ENUM) !== 0) return <EnumIcon {...p} />;

    // oxlint-disable-next-line no-constant-binary-expression
    if (false
        || superName === 'java/lang/Exception'
        || superName === 'java/lang/RuntimeException'
        || superName === 'java/lang/Throwable'
        || /^(.*\/)?\w+Exception$/.test(className)) return <ExceptionIcon {...p} />;

    if ((accessFlags & ACC_RECORD) !== 0) return <RecordIcon {...p} />;
    if ((accessFlags & ACC_ABSTRACT) !== 0) return <ClassAbstractIcon {...p} />;
    if ((accessFlags & ACC_FINAL) !== 0) return <ClassFinalIcon {...p} />;

    return <ClassIcon {...p} />;
};
