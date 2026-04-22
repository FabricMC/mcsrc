import { useState } from 'react';
import { Button, Checkbox, Flex, Input, Progress, Space, Typography } from 'antd';
import { useObservable } from '../utils/UseObservable';
import { runGrep, cancelGrep, grepResults, grepRunning, grepProgress } from '../logic/GrepSearch';
import { openCodeTab } from '../logic/tabs';
import { grepHighlightQuery } from '../logic/State';

const { Text } = Typography;

const GrepPanel = () => {
    const [query, setQuery] = useState('');
    const [useRegex, setUseRegex] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);

    const results = useObservable(grepResults) ?? [];
    const running = useObservable(grepRunning) ?? false;
    const progress = useObservable(grepProgress) ?? { done: 0, total: 0, phase: 'scanning' };

    const handleSearch = () => {
        if (!query.trim() || running) return;
        runGrep(query, { regex: useRegex, caseSensitive, wholeWord });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSearch();
    };

    const handleResultClick = (className: string) => {
        grepHighlightQuery.next(query);
        openCodeTab(className + '.class');
    };

    const percent = progress.total > 0
        ? Math.round((progress.done / progress.total) * 100)
        : 0;

    const phaseLabel = progress.phase === 'scanning' ? 'Scanning...' : 'Decompiling matches...';

    return (
        <Flex vertical gap={6} style={{ height: '100%', overflow: 'hidden' }}>
            <Input
                placeholder="Search in source..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                allowClear
                disabled={running}
            />

            <Flex gap={8} wrap="wrap" style={{ fontSize: '12px' }}>
                <Checkbox checked={useRegex} onChange={e => setUseRegex(e.target.checked)} disabled={running}>
                    <Text style={{ fontSize: '12px' }}>.*</Text>
                </Checkbox>
                <Checkbox checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} disabled={running}>
                    <Text style={{ fontSize: '12px' }}>Aa</Text>
                </Checkbox>
                <Checkbox checked={wholeWord} onChange={e => setWholeWord(e.target.checked)} disabled={running}>
                    <Text style={{ fontSize: '12px' }}>|W|</Text>
                </Checkbox>
            </Flex>

            <Space>
                {running ? (
                    <Button size="small" danger onClick={cancelGrep}>Stop</Button>
                ) : (
                    <Button size="small" type="primary" onClick={handleSearch} disabled={!query.trim()}>
                        Search
                    </Button>
                )}
                {results.length > 0 && (
                    <Text style={{ fontSize: '12px' }}>
                        {results.length} match{results.length !== 1 ? 'es' : ''}
                    </Text>
                )}
            </Space>

            {running && progress.total > 0 && (
                <div>
                    <Text style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                        {phaseLabel} {progress.done}/{progress.total}
                    </Text>
                    <Progress
                        percent={percent}
                        size="small"
                        showInfo={false}
                        strokeColor={progress.phase === 'scanning' ? '#52c41a' : '#1677ff'}
                    />
                </div>
            )}

            <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                {results.length === 0 && !running && query && (
                    <Text style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', padding: '4px 8px', display: 'block' }}>
                        No results
                    </Text>
                )}
                {results.map((match, i) => (
                    <div
                        key={i}
                        onClick={() => handleResultClick(match.className)}
                        style={{ cursor: 'pointer', padding: '2px 8px', fontSize: '12px', borderRadius: '4px', transition: 'background-color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <div style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                            {match.className.split('/').pop()}
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 'normal' }}>
                                :{match.lineNumber}
                            </span>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {match.lineText}
                        </div>
                    </div>
                ))}
            </div>
        </Flex>
    );
};

export default GrepPanel;