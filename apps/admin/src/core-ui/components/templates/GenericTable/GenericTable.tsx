'use client';

import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  useDisclosure,
} from '@heroui/react';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { useEffect, useMemo, useState } from 'react';
import { IoMdCheckmarkCircleOutline } from 'react-icons/io';
import { truncateMiddle } from '../../../helpers';
import { useNetworkConfigStore } from '../../../stores';
import { GenericTableProps } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getValue = (value: any) => {
  const valueString = JSON.stringify(value, null, 2) ?? '';
  if (valueString.length > 50) {
    return { truncated: true, original: valueString, value: truncateMiddle(valueString, 10, 10) };
  }

  return { truncated: false, original: valueString, value: String(value) };
};

export function GenericTable({ rows, refetch, children }: GenericTableProps) {
  const { network } = useNetworkConfigStore();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [expandedValue, setExpandedValue] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{ key: string; value: string } | null>(null);
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: '', direction: null });
  const [searchTerm, setSearchTerm] = useState('');
  const keys = [
    ...new Set(
      Object.values(rows)
        .map((deposit) => Object.keys(deposit))
        .flat()
    ),
  ];
  const [filters, setFilters] = useState<Record<string, string>>({});
  const filteredData = useMemo(() => {
    const keys = [
      ...new Set(
        Object.values(rows)
          .map((deposit) => Object.keys(deposit))
          .flat()
      ),
    ];
    const parsedRows = rows.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newRow: { [key: string]: { value: string; original: any; truncated: boolean } } = {};
      keys.forEach((key) => {
        newRow[key] = getValue(row[key]);
      });
      return newRow;
    });
    const result = parsedRows.filter((row) => {
      const matchesFilters = keys.every((key) => {
        const filterValue = filters[key];
        if (!filterValue) return true;
        return row[key].value?.toLowerCase().includes(filterValue?.toLowerCase());
      });

      const matchesSearch = !searchTerm
        ? true
        : keys.some((key) => row[key].value?.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchesFilters && matchesSearch;
    });
    if (sort.direction) {
      result.sort((a, b) => {
        const aVal = a[sort.key].value;
        const bVal = b[sort.key].value;
        return sort.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    }
    return result;
  }, [rows, filters, searchTerm, sort.direction, sort.key]);

  useEffect(() => {
    void refetch();
  }, [filters, network?.name, refetch]);

  const activeFiltersSummary = Object.entries(filters)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const toggleRowSelection = (id: string) => {
    setSelectedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleExportCSV = () => {
    const dataToExport = filteredData.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj: Record<string, any> = {};
      keys.forEach((key) => {
        obj[key] = row[key]?.original;
      });
      return obj;
    });
    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, 'export.csv');
  };

  const alterColor: { [key: string]: number } = {};
  let indexBySort = 0;
  filteredData.forEach((a) => {
    const value = a[sort.key]?.value;
    if (!alterColor[value]) {
      alterColor[value] = indexBySort;
      indexBySort++;
    }
  });

  return (
    <div className="h-full w-full left-0 overflow-auto bg-background">
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        <Button onPress={onOpen}>Filtros</Button>
        <Button variant="light" onPress={() => refetch()}>
          Refrescar
        </Button>
        <Button variant="light" onPress={handleExportCSV}>
          Exportar CSV
        </Button>
        <Input
          size="sm"
          placeholder="Buscar en todos los campos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs"
        />
        <div className="text-sm text-gray-600 truncate" style={{ maxWidth: 'calc(100vw - 200px)' }}>
          {activeFiltersSummary || 'No hay filtros activos'}
        </div>
      </div>
      <Modal isOpen={isOpen} onClose={onClose} scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>Filtros</ModalHeader>
          <ModalBody
            className="flex flex-col gap-2"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onClose();
              }
            }}
          >
            {keys.map((key) => (
              <Input
                key={key}
                label={key}
                placeholder={`Filtrar por ${key}`}
                value={filters[key] || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }))}
                size="sm"
              />
            ))}
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>Cerrar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Table aria-label="Tabla" className="w-full" style={{ tableLayout: 'auto' }}>
        <TableHeader>
          <TableColumn key="select">
            <input
              type="checkbox"
              checked={
                filteredData.length > 0 &&
                filteredData.every((item, index) => selectedRows.has(item.id?.value as string))
              }
              onChange={(e) => {
                if (e.target.checked) {
                  const allIds = new Set(filteredData.map((item, index) => item.id?.value as string));
                  setSelectedRows(allIds);
                } else {
                  setSelectedRows(new Set());
                }
              }}
            />
          </TableColumn>
          {
            [
              ...keys.map((key) => {
                let arrow = '-';
                if (sort.key === key) {
                  if (sort.direction === 'asc') arrow = '↑';
                  else if (sort.direction === 'desc') arrow = '↓';
                }
                return (
                  <TableColumn key={key}>
                    <button
                      type="button"
                      onClick={() => {
                        if (sort.key !== key) {
                          setSort({ key, direction: 'asc' });
                        } else {
                          if (sort.direction === 'asc') {
                            setSort({ key, direction: 'desc' });
                          } else if (sort.direction === 'desc') {
                            setSort({ key: '', direction: null });
                          } else {
                            setSort({ key, direction: 'asc' });
                          }
                        }
                      }}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                      aria-label={`Ordenar por ${key}`}
                      title={`Ordenar por ${key}`}
                    >
                      <span>{key.toUpperCase()}</span>
                      <span aria-hidden="true">{arrow}</span>
                    </button>
                  </TableColumn>
                );
              }),
              ...(children ? [<TableColumn key="action">Action</TableColumn>] : []),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any
          }
        </TableHeader>
        <TableBody>
          {filteredData.map((item, index) => (
            <TableRow
              key={item.id?.value + '' + index}
              className={
                (highlight && item[highlight.key]?.value === highlight.value ? 'bg-yellow-100' : '') +
                (sort.key && alterColor[item[sort?.key]?.value] % 2 === 0 ? 'bg-blue-50' : '')
              }
            >
              <TableCell key="select">
                <input
                  type="checkbox"
                  checked={selectedRows.has(item.id?.value as string)}
                  onChange={() => toggleRowSelection(item.id?.value as string)}
                />
              </TableCell>
              {
                [
                  ...keys.map((key) => {
                    return (
                      <TableCell key={key}>
                        <div className="flex flex-row font-mono text-xs" style={{ gap: 4, alignItems: 'center' }}>
                          {item[key]?.truncated ? (
                            <Button size="sm" onPress={() => setExpandedValue(item[key]?.original)}>
                              {item[key]?.value}
                            </Button>
                          ) : (
                            <span>{item[key]?.value}</span>
                          )}
                          <div
                            onClick={() => {
                              if (key === highlight?.key && item[key]?.value === highlight?.value) {
                                setHighlight({ key: '', value: '' });
                              } else {
                                setHighlight({ key, value: item[key]?.value as string });
                              }
                            }}
                            className={`cursor-pointer rounded transition p-1 hover:bg-green-100 opacity-0 hover:opacity-100 ${
                              highlight?.key === key && item[key]?.value === highlight?.value ? 'opacity-100' : ''
                            }`}
                            style={{ height: 'min-content' }}
                            title={`Resaltar por ${key}`}
                          >
                            {/* <CheckIcon className="h-4 w-4 text-green-600" /> */}
                            <IoMdCheckmarkCircleOutline className="h-4 w-4 text-green-600" />
                          </div>
                        </div>
                      </TableCell>
                    );
                  }),
                  ...(children ? [<TableCell key="children">{children(item)}</TableCell>] : []),
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ] as any
              }
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Modal isOpen={!!expandedValue} onClose={() => setExpandedValue(null)} scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>Valor completo</ModalHeader>
          <ModalBody>
            <pre className="whitespace-pre-wrap break-all text-sm">{expandedValue}</pre>
          </ModalBody>
          <ModalFooter>
            <Button onPress={() => setExpandedValue(null)}>Cerrar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
