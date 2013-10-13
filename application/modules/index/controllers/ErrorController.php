<?php
/**
 * ErrorController
 */
class ErrorController extends Zend_Controller_Action
{
    public function errorAction()
    {

    $errors = $this->_getParam('error_handler');
        switch ($errors->type) {
            case Zend_Controller_Plugin_ErrorHandler::EXCEPTION_NO_CONTROLLER:
            case Zend_Controller_Plugin_ErrorHandler::EXCEPTION_NO_ACTION:
                // 404 error -- controller or action not found
                $this->getResponse()
                     ->setRawHeader('HTTP/1.1 404 Not Found');
                $this->view->msg = "ERROR 404!!";
                // ... get some output to display...
                break;
            default:
                $this->view->msg = "Ocurrio un error, hemos enviado un reporte y sera solucionado a la brevedad";
                // application error; display error page, but don't
                // change status code
                try {
                    Mob_Loader::getModel("Errores")->insert(array("error" => serialize($errors)));
                } catch (Exception $e) {
                
                }
                break;
        }

    }
}
