'use client';

import {
  Button,
  Input,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { useEffect, useMemo, useState } from 'react';
import { IoMdCheckmarkCircleOutline } from 'react-icons/io';
import { truncateMiddle } from '../../../helpers';
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
  const [isOpen, setIsOpen] = useState(false);
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
  }, [filters, refetch]);

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

  // HeroUI's Table is built on react-aria's collection system, which does not support mixing a
  // static <TableColumn>/<TableRow> with a spread array of dynamic ones. Build flat collections and
  // feed them through the dynamic `columns`/`items` API instead.
  type Column = { id: string; type: 'select' | 'data' | 'action' };
  const columns: Column[] = [
    { id: '__select__', type: 'select' },
    ...keys.map((key): Column => ({ id: key, type: 'data' })),
    ...(children ? [{ id: '__action__', type: 'action' as const }] : []),
  ];

  const bodyItems = filteredData.map((row, index) => ({
    id: `${row.id?.value ?? ''}_${index}`,
    row,
  }));

  const renderHeaderCell = (column: Column) => {
    if (column.type === 'select') {
      return (
        <input
          type="checkbox"
          checked={filteredData.length > 0 && filteredData.every((item) => selectedRows.has(item.id?.value as string))}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedRows(new Set(filteredData.map((item) => item.id?.value as string)));
            } else {
              setSelectedRows(new Set());
            }
          }}
        />
      );
    }
    if (column.type === 'action') {
      return 'Action';
    }
    const key = column.id;
    let arrow = '-';
    if (sort.key === key) {
      if (sort.direction === 'asc') arrow = '↑';
      else if (sort.direction === 'desc') arrow = '↓';
    }
    return (
      <button
        type="button"
        onClick={() => {
          if (sort.key !== key) {
            setSort({ key, direction: 'asc' });
          } else if (sort.direction === 'asc') {
            setSort({ key, direction: 'desc' });
          } else if (sort.direction === 'desc') {
            setSort({ key: '', direction: null });
          } else {
            setSort({ key, direction: 'asc' });
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
    );
  };

  const renderBodyCell = (row: (typeof filteredData)[number], columnKey: string) => {
    if (columnKey === '__select__') {
      return (
        <input
          type="checkbox"
          checked={selectedRows.has(row.id?.value as string)}
          onChange={() => toggleRowSelection(row.id?.value as string)}
        />
      );
    }
    if (columnKey === '__action__') {
      return children ? children(row) : null;
    }
    const key = columnKey;
    return (
      <div className="flex flex-row font-mono text-xs" style={{ gap: 4, alignItems: 'center' }}>
        {row[key]?.truncated ? (
          <Button size="sm" onPress={() => setExpandedValue(row[key]?.original)}>
            {row[key]?.value}
          </Button>
        ) : (
          <span>{row[key]?.value}</span>
        )}
        <div
          onClick={() => {
            if (key === highlight?.key && row[key]?.value === highlight?.value) {
              setHighlight({ key: '', value: '' });
            } else {
              setHighlight({ key, value: row[key]?.value as string });
            }
          }}
          className={`cursor-pointer rounded transition p-1 hover:bg-green-100 opacity-0 hover:opacity-100 ${
            highlight?.key === key && row[key]?.value === highlight?.value ? 'opacity-100' : ''
          }`}
          style={{ height: 'min-content' }}
          title={`Resaltar por ${key}`}
        >
          <IoMdCheckmarkCircleOutline className="h-4 w-4 text-green-600" />
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full left-0 overflow-auto bg-background">
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        <Button onPress={() => setIsOpen(true)}>Filtros</Button>
        <Button variant="ghost" onPress={() => refetch()}>
          Refrescar
        </Button>
        <Button variant="ghost" onPress={handleExportCSV}>
          Exportar CSV
        </Button>
        <Input
          placeholder="Buscar en todos los campos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs"
        />
        <div className="text-sm text-gray-600 truncate" style={{ maxWidth: 'calc(100vw - 200px)' }}>
          {activeFiltersSummary || 'No hay filtros activos'}
        </div>
      </div>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={setIsOpen}>
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <Modal.Header><Modal.Heading>Filtros</Modal.Heading></Modal.Header>
            <Modal.Body
              className="flex flex-col gap-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setIsOpen(false);
                }
              }}
            >
              {keys.map((key) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-sm font-medium">{key}</label>
                  <Input
                    placeholder={`Filtrar por ${key}`}
                    value={filters[key] || ''}
                    onChange={(e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </Modal.Body>
            <Modal.Footer>
              <Button onPress={() => setIsOpen(false)}>Cerrar</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Table aria-label="Tabla" className="w-full" style={{ tableLayout: 'auto' }}>
        <TableHeader columns={columns}>
          {(column) => <TableColumn id={column.id}>{renderHeaderCell(column)}</TableColumn>}
        </TableHeader>
        <TableBody items={bodyItems} renderEmptyState={() => 'No hay datos'}>
          {(item) => (
            <TableRow
              id={item.id}
              columns={columns}
              className={
                (highlight && item.row[highlight.key]?.value === highlight.value ? 'bg-yellow-100' : '') +
                (sort.key && alterColor[item.row[sort?.key]?.value] % 2 === 0 ? 'bg-blue-50' : '')
              }
            >
              {(column) => <TableCell>{renderBodyCell(item.row, column.id)}</TableCell>}
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Modal.Backdrop isOpen={!!expandedValue} onOpenChange={(o) => { if (!o) setExpandedValue(null); }}>
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <Modal.Header><Modal.Heading>Valor completo</Modal.Heading></Modal.Header>
            <Modal.Body>
              <pre className="whitespace-pre-wrap break-all text-sm">{expandedValue}</pre>
            </Modal.Body>
            <Modal.Footer>
              <Button onPress={() => setExpandedValue(null)}>Cerrar</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
