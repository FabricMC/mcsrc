import { Card, Divider, Input, Select, Checkbox, Space, Dropdown, Button, Progress } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import Header from "./Header";
import FileList from "./FileList";
import type { SearchProps } from "antd/es/input";
import { useObservable } from "../utils/UseObservable";
import { isSearching, searchQuery, searchMode, type SearchModeConfig, searchProgress } from "../logic/Search";
import type { SearchOptions } from "../utils/Classfile";
import SearchResults from "./SearchResults";
import { isThin } from "../logic/Browser";

const { Search } = Input;

const SideBar = () => {
    const isSmall = useObservable(isThin);
    const currentSearchMode = useObservable(searchMode);

    const onChange: SearchProps['onChange'] = (e) => {
        searchQuery.next(e.target.value);
    };

    const onSearchModeChange = (value: 'className' | 'classContent') => {
        if (value === 'className') {
            searchMode.next({ mode: 'className' });
        } else {
            searchMode.next({
                mode: 'classContent',
                options: {
                    constantPool: true,
                    fields: true,
                    methods: true
                }
            });
        }
    };

    const onSearchOptionsChange = (optionKey: keyof SearchOptions, checked: boolean) => {
        if (currentSearchMode?.mode === 'classContent') {
            searchMode.next({
                mode: 'classContent',
                options: {
                    ...currentSearchMode.options,
                    [optionKey]: checked
                }
            });
        }
    };

    const searchOptionsMenu = {
        items: [
            {
                key: 'mode',
                label: (
                    <Select
                        style={{ width: '100%' }}
                        value={currentSearchMode?.mode || 'className'}
                        onChange={onSearchModeChange}
                        options={[
                            { label: 'Class Name', value: 'className' },
                            { label: 'Class Content', value: 'classContent' }
                        ]}
                    />
                ),
                type: 'group' as const
            },
            ...(currentSearchMode?.mode === 'classContent' ? [
                { type: 'divider' as const, key: 'divider' },
                {
                    key: 'constantPool',
                    label: (
                        <Checkbox
                            checked={currentSearchMode.options.constantPool}
                            onChange={(e) => onSearchOptionsChange('constantPool', e.target.checked)}
                        >
                            Constant Pool
                        </Checkbox>
                    )
                },
                {
                    key: 'fields',
                    label: (
                        <Checkbox
                            checked={currentSearchMode.options.fields}
                            onChange={(e) => onSearchOptionsChange('fields', e.target.checked)}
                        >
                            Fields
                        </Checkbox>
                    )
                },
                {
                    key: 'methods',
                    label: (
                        <Checkbox
                            checked={currentSearchMode.options.methods}
                            onChange={(e) => onSearchOptionsChange('methods', e.target.checked)}
                        >
                            Methods
                        </Checkbox>
                    )
                }
            ] : [])
        ]
    };

    return (
        <Card cover={isSmall ? undefined : <Header />} variant="borderless">
            <Space.Compact style={{ width: '100%' }}>
                <Search placeholder="Search classes" allowClear onChange={onChange} style={{ width: '100%' }}></Search>
                <Dropdown menu={searchOptionsMenu} trigger={['click']}>
                    <Button icon={<SettingOutlined />} />
                </Dropdown>
            </Space.Compact>
            <Divider size="small" />
            <FileListOrSearchResults />
        </Card>
    );
};

const FileListOrSearchResults = () => {
    const showSearchResults = useObservable(isSearching);
    const progress = useObservable(searchProgress) || -1;

    console.log('FileListOrSearchResults render - progress:', progress, 'showSearchResults:', showSearchResults);

    if (progress >= 0 && progress < 100) {
        return <Progress percent={progress} />;
    } else if (showSearchResults) {
        return <SearchResults />;
    } else {
        return <FileList />;
    }
};

export default SideBar;
