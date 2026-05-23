import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Type, Image as ImageIcon } from 'lucide-react';

interface ImageDropDialogProps {
  open: boolean;
  onClose: () => void;
  onOCR: () => void;
  onInsertImage: () => void;
  isProcessing: boolean;
}

const ImageDropDialog: React.FC<ImageDropDialogProps> = ({
  open,
  onClose,
  onOCR,
  onInsertImage,
  isProcessing,
}) => {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !isProcessing && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Image dropped</DialogTitle>
          <DialogDescription>
            What would you like to do with this image?
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
          <Button
            variant="outline"
            className="justify-start gap-3 h-auto py-3"
            onClick={onOCR}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Type className="h-5 w-5" />
            )}
            <div className="text-left">
              <div className="font-medium">Extract text (OCR)</div>
              <div className="text-xs text-muted-foreground">Read text from the image</div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-3 h-auto py-3"
            onClick={onInsertImage}
            disabled={isProcessing}
          >
            <ImageIcon className="h-5 w-5" />
            <div className="text-left">
              <div className="font-medium">Insert as image</div>
              <div className="text-xs text-muted-foreground">Add it to the page as a photo</div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageDropDialog;
