import { TableBody, TableCell, TableRow } from "@/design-systems/shadcn/components/table";
import { Skeleton } from "@/design-systems/shadcn/components/skeleton";

export function UsersTableSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: 3 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell className="px-4 py-3">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-3 w-[160px]" />
              </div>
            </div>
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-6 w-[80px]" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <div className="flex -space-x-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-8 rounded-full" />
              ))}
            </div>
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-6 w-[60px]" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-[140px]" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-4 w-[140px]" />
          </TableCell>
          <TableCell className="px-4 py-3">
            <Skeleton className="h-8 w-8 rounded-md" />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}
