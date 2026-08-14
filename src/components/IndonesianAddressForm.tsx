import React, { useState } from 'react';
import GoogleAddressAutocomplete, { FullAddressSelection } from './GoogleAddressAutocomplete';
import { Sparkles, MapPin, ListFilter } from 'lucide-react';

export interface AddressData {
  provinsi: string;
  kabupaten: string;
  kecamatan: string;
  desa: string;
  dusun: string;
  kode_pos: string;
}

interface IndonesianAddressFormProps {
  value: AddressData;
  onChange: (updated: AddressData) => void;
  darkTheme?: boolean;
}

export const IndonesianAddressForm: React.FC<IndonesianAddressFormProps> = ({
  value,
  onChange,
  darkTheme = false
}) => {
  return (
    <GoogleAddressAutocomplete
      darkTheme={darkTheme}
      value={value}
      onChange={onChange}
    />
  );
};

export default IndonesianAddressForm;
