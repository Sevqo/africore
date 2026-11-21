export type AppointmentType = {
  id: string;
  data?: {
    active?: boolean;
    [key: string]: unknown;
  };
};

export function activeAppointmentTypes<T extends AppointmentType>(types: T[]): T[] {
  return types.filter((type) => type.data?.active === true);
}
