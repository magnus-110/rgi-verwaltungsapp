
import { useState, useEffect, useCallback } from 'react';
import { useProperty } from '@/hooks/useProperties';
import { usePropertyImageHandler } from './usePropertyImageHandler';
import { usePropertyValidation } from './usePropertyValidation';
import { usePropertyAutoSave } from './usePropertyAutoSave';
import { usePropertySubmission } from './usePropertySubmission';
import { PropertyFormData, initialFormData } from '@/types/propertyForm';

interface UsePropertyFormProps {
  editingPropertyId?: string | null;
  onSuccess: () => void;
}

export const usePropertyForm = ({ editingPropertyId, onSuccess }: UsePropertyFormProps) => {
  const [formData, setFormData] = useState<PropertyFormData>(initialFormData);
  const { property, loading: propertyLoading } = useProperty(editingPropertyId || '');

  const { uploadedImages, setUploadedImages, handleImageProcessing, uploadProgress } = usePropertyImageHandler({
    initialPropertyImages: property?.property_images,
  });

  const formValidation = usePropertyValidation(formData);
  const { triggerAutoSave } = usePropertyAutoSave({
    editingPropertyId,
    isValid: formValidation.isValid
  });

  const { handleSubmit, loading } = usePropertySubmission({
    editingPropertyId,
    handleImageProcessing,
    onSuccess,
    isValid: formValidation.isValid,
    validationErrors: formValidation.errors
  });

  // Load property data for editing
  useEffect(() => {
    if (editingPropertyId && property && !propertyLoading) {
      setFormData({
        transaction_type: property.transaction_type || 'sale',
        title: property.title || '',
        description: property.description || '',
        property_type: property.property_type || 'Wohnung',
        property_subtype: (property as any).property_subtype ?? null,
        street: property.street || '',
        house_number: property.house_number || '',
        postal_code: property.postal_code || '',
        city: property.city || '',
        district: property.district || '',
        purchase_price: property.purchase_price,
        provision: (property as any).provision || null,
        cold_rent: property.cold_rent,
        warm_rent: property.warm_rent,
        living_space: property.living_space,
        plot_size: property.plot_size,
        rooms: property.rooms,
        floor_number: property.floor_number,
        total_floors: property.total_floors,
        year_built: property.year_built,
        has_balcony: property.has_balcony || false,
        has_terrace: property.has_terrace || false,
        has_garden: property.has_garden || false,
        has_cellar: property.has_cellar || false,
        has_parking: property.has_parking || false,
        has_elevator: property.has_elevator || false,
        has_guest_toilet: property.has_guest_toilet || false,
        has_fitted_kitchen: property.has_fitted_kitchen || false,
        is_barrier_free: property.is_barrier_free || false,
        availability_status: property.availability_status || 'available',
        is_active: property.is_active !== false,
        energy_certificate_type: property.energy_certificate_type ?? null,
        energy_value: property.energy_value ?? null,
        energy_efficiency_class: property.energy_efficiency_class ?? null,
        energy_source: property.energy_source ?? null,
        heating_type: property.heating_type ?? null,
        property_condition: property.property_condition ?? null,
        energy_certificate_creation_date: property.energy_certificate_creation_date ?? null
      });
    }
  }, [editingPropertyId, property, propertyLoading]);

  const updateFormData = useCallback((field: string, value: any) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      triggerAutoSave(newData);
      return newData;
    });
  }, [triggerAutoSave]);

  const onSubmit = useCallback((e: React.FormEvent) => {
    handleSubmit(e, formData);
  }, [handleSubmit, formData]);

  return {
    formData,
    updateFormData,
    uploadedImages,
    setUploadedImages,
    handleSubmit: onSubmit,
    loading,
    propertyLoading,
    uploadProgress,
    formValidation,
  };
};
