
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PropertyBasicInfoProps {
  formData: any;
  updateFormData: (field: string, value: any) => void;
}

const PropertyBasicInfo: React.FC<PropertyBasicInfoProps> = ({ formData, updateFormData }) => {
  const isRental = formData.transaction_type === 'rent';

  return (
    <Card className="shadow-sm border border-gray-200">
      <CardHeader className="bg-white border-b border-gray-100 px-8 py-6">
        <CardTitle className="text-2xl font-semibold text-gray-900">Grundinformationen</CardTitle>
      </CardHeader>
      <CardContent className="p-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Transaktionsart */}
          <div className="space-y-3">
            <Label htmlFor="transaction_type" className="text-base font-medium text-gray-700">
              Transaktionsart
            </Label>
            <Select 
              value={formData.transaction_type || ''} 
              onValueChange={(value) => updateFormData('transaction_type', value)}
            >
              <SelectTrigger className="h-12 text-base border-gray-300 focus:border-rgi-orange focus:ring-rgi-orange/20 bg-white">
                <SelectValue placeholder="Bitte wählen..." />
              </SelectTrigger>
              <SelectContent className="bg-white z-50">
                <SelectItem value="sale" className="text-base py-3">Verkauf</SelectItem>
                <SelectItem value="rent" className="text-base py-3">Vermietung</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Immobilienart */}
          <div className="space-y-3">
            <Label htmlFor="property_type" className="text-base font-medium text-gray-700">
              Immobilienart
            </Label>
            <Select
              value={formData.property_type || ''}
              onValueChange={(value) => updateFormData('property_type', value)}
            >
              <SelectTrigger className="h-12 text-base border-gray-300 focus:border-rgi-orange focus:ring-rgi-orange/20 bg-white">
                <SelectValue placeholder="Bitte wählen..." />
              </SelectTrigger>
              <SelectContent className="bg-white z-50">
                <SelectItem value="Wohnung" className="text-base py-3">Wohnung</SelectItem>
                <SelectItem value="Haus" className="text-base py-3">Haus</SelectItem>
                <SelectItem value="Gewerbe" className="text-base py-3">Gewerbe</SelectItem>
                <SelectItem value="Grundstück" className="text-base py-3">Grundstück</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Objektart für die Schaufensteranzeige */}
        <div className="space-y-3">
          <Label htmlFor="property_subtype" className="text-base font-medium text-gray-700">
            Objektart für den Schaufensterbildschirm
          </Label>
          <Input
            id="property_subtype"
            type="text"
            list="objektart-vorschlaege"
            value={formData.property_subtype || ''}
            onChange={(e) => updateFormData('property_subtype', e.target.value)}
            placeholder="z.B. Einfamilienhaus"
            className="h-12 text-base border-gray-300 focus:border-rgi-orange focus:ring-rgi-orange/20"
          />
          <datalist id="objektart-vorschlaege">
            <option value="Einfamilienhaus" />
            <option value="Doppelhaushälfte" />
            <option value="Reihenhaus" />
            <option value="Mehrfamilienhaus" />
            <option value="Eigentumswohnung" />
            <option value="Penthouse" />
            <option value="Maisonette" />
            <option value="Dachgeschosswohnung" />
            <option value="Erdgeschosswohnung" />
            <option value="Ferienwohnung" />
            <option value="Hotel" />
            <option value="Pension" />
            <option value="Ladenfläche" />
            <option value="Bürofläche" />
            <option value="Baugrundstück" />
          </datalist>
          <p className="text-sm text-gray-500">
            Diese Bezeichnung erscheint groß auf dem Schaufensterbildschirm. Kurze Begriffe
            wirken aus der Ferne am stärksten. Bleibt das Feld leer, wird die Bezeichnung
            automatisch aus Immobilienart und Zimmerzahl gebildet (z.&nbsp;B.
            „3-Zimmer-Wohnung“).
          </p>
        </div>

        {/* Überschrift */}
        <div className="space-y-3">
          <Label htmlFor="title" className="text-base font-medium text-gray-700">
            Überschrift
          </Label>
          <Input
            id="title"
            type="text"
            value={formData.title || ''}
            onChange={(e) => updateFormData('title', e.target.value)}
            placeholder="z.B. Moderne 3-Zimmer-Wohnung mit Balkon"
            className="h-12 text-base border-gray-300 focus:border-rgi-orange focus:ring-rgi-orange/20"
          />
        </div>

        {/* Beschreibung */}
        <div className="space-y-3">
          <Label htmlFor="description" className="text-base font-medium text-gray-700">Beschreibung</Label>
          <Textarea
            id="description"
            value={formData.description || ''}
            onChange={(e) => updateFormData('description', e.target.value)}
            placeholder="Detaillierte Beschreibung der Immobilie..."
            rows={5}
            className="text-base border-gray-300 focus:border-rgi-orange focus:ring-rgi-orange/20 resize-none"
          />
        </div>

        {/* Preis */}
        <div className="border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-6">Preisangaben</h3>
          {isRental ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="cold_rent" className="text-base font-medium text-gray-700">Kaltmiete (€)</Label>
                <Input
                  id="cold_rent"
                  type="number"
                  value={formData.cold_rent || ''}
                  onChange={(e) => updateFormData('cold_rent', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="z.B. 800"
                  className="h-12 text-base border-gray-300 focus:border-rgi-orange focus:ring-rgi-orange/20"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="warm_rent" className="text-base font-medium text-gray-700">Warmmiete (€)</Label>
                <Input
                  id="warm_rent"
                  type="number"
                  value={formData.warm_rent || ''}
                  onChange={(e) => updateFormData('warm_rent', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="z.B. 920"
                  className="h-12 text-base border-gray-300 focus:border-rgi-orange focus:ring-rgi-orange/20"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="purchase_price" className="text-base font-medium text-gray-700">Kaufpreis (€)</Label>
                <Input
                  id="purchase_price"
                  type="number"
                  value={formData.purchase_price || ''}
                  onChange={(e) => updateFormData('purchase_price', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="z.B. 450000"
                  className="h-12 text-base border-gray-300 focus:border-rgi-orange focus:ring-rgi-orange/20"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="provision" className="text-base font-medium text-gray-700">Provision (%)</Label>
                <Input
                  id="provision"
                  type="number"
                  step="0.1"
                  value={formData.provision || ''}
                  onChange={(e) => updateFormData('provision', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="z.B. 3.57"
                  className="h-12 text-base border-gray-300 focus:border-rgi-orange focus:ring-rgi-orange/20"
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PropertyBasicInfo;
